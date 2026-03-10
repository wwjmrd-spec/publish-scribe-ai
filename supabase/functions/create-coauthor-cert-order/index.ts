import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("Payment gateway not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Authorization header required");

    // Auth: verify JWT using anon key client + getClaims
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("Auth verification failed:", claimsError?.message);
      throw new Error("Unauthorized");
    }

    const user = { id: claimsData.claims.sub as string };
    console.log("Authenticated user for co-author cert order:", user.id);

    const { coAuthorId, articleId, amount, currency } = await req.json();

    if (!coAuthorId || !articleId || !amount || !currency) {
      throw new Error("Missing required fields");
    }

    if (!["INR", "USD"].includes(currency)) {
      throw new Error("Invalid currency");
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the article belongs to the user and is published
    const { data: article, error: articleError } = await serviceClient
      .from("articles")
      .select("id, author_id, status")
      .eq("id", articleId)
      .eq("author_id", user.id)
      .eq("status", "published")
      .single();

    if (articleError || !article) {
      throw new Error("Article not found, not yours, or not published");
    }

    // Verify the co-author belongs to this article
    const { data: coAuthor, error: coAuthorError } = await serviceClient
      .from("co_authors")
      .select("id, name")
      .eq("id", coAuthorId)
      .eq("article_id", articleId)
      .single();

    if (coAuthorError || !coAuthor) {
      throw new Error("Co-author not found for this article");
    }

    // Check if already paid
    const { data: existingCert } = await serviceClient
      .from("co_author_certificates")
      .select("id, payment_status")
      .eq("co_author_id", coAuthorId)
      .eq("article_id", articleId)
      .maybeSingle();

    if (existingCert?.payment_status === "paid") {
      throw new Error("Certificate already paid for this co-author");
    }

    // Create Razorpay order
    const amountInSmallestUnit = Math.round(amount * 100);
    const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${razorpayAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInSmallestUnit,
        currency,
        receipt: `coauthor_cert_${Date.now()}`,
        notes: {
          user_id: user.id,
          co_author_id: coAuthorId,
          article_id: articleId,
          type: "coauthor_certificate",
        },
      }),
    });

    if (!orderResponse.ok) {
      const errorData = await orderResponse.text();
      console.error("Razorpay order creation failed:", errorData);
      throw new Error("Failed to create payment order");
    }

    const orderData = await orderResponse.json();
    console.log("Razorpay order created for co-author cert:", orderData.id);

    // Create or update co_author_certificates record
    let certRecordId: string;

    if (existingCert) {
      await serviceClient
        .from("co_author_certificates")
        .update({
          payment_status: "pending",
          payment_id: orderData.id,
          amount_paid: amount,
          currency,
        })
        .eq("id", existingCert.id);
      certRecordId = existingCert.id;
    } else {
      const { data: newCert, error: insertError } = await serviceClient
        .from("co_author_certificates")
        .insert({
          co_author_id: coAuthorId,
          article_id: articleId,
          payment_status: "pending",
          payment_id: orderData.id,
          amount_paid: amount,
          currency,
        })
        .select("id")
        .single();

      if (insertError || !newCert) {
        console.error("Failed to create cert record:", insertError);
        throw new Error("Failed to initialize certificate record");
      }
      certRecordId = newCert.id;
    }

    return new Response(
      JSON.stringify({
        orderId: orderData.id,
        amount: amountInSmallestUnit,
        currency,
        keyId: RAZORPAY_KEY_ID,
        certRecordId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error creating co-author cert order:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to create payment order",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
