import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client to verify the user's JWT
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("Auth verification failed:", claimsError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    console.log("Authenticated user:", userId);

    // Service role client for data operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { articleId, fileType, fileName } = await req.json();

    // Handle co-author certificate download (uses fileName directly)
    if (fileType === "coauthor_certificate" && fileName) {
      // Verify user has access - check if they own any article linked to this certificate
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      const isAdmin = roleData?.role === "admin";

      if (!isAdmin) {
        // Check if the user owns an article that has this co-author certificate
        const { data: certData } = await supabase
          .from("co_author_certificates")
          .select("article_id, articles:article_id (author_id)")
          .eq("certificate_url", fileName)
          .eq("payment_status", "paid")
          .limit(1)
          .maybeSingle();

        const certArticle = certData?.articles as any;
        if (!certData || certArticle?.author_id !== userId) {
          return new Response(JSON.stringify({ error: "Access denied" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Extract just the filename
      const urlParts = fileName.split("/");
      const cleanFileName = urlParts[urlParts.length - 1].split("?")[0];

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("certificates")
        .createSignedUrl(cleanFileName, 60 * 60);

      if (signedUrlError || !signedUrlData) {
        console.error("Signed URL error:", signedUrlError);
        return new Response(JSON.stringify({ error: "Failed to generate download URL" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Generated download URL for co-author certificate: ${cleanFileName}`);
      return new Response(
        JSON.stringify({ success: true, url: signedUrlData.signedUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!articleId || !fileType) {
      return new Response(JSON.stringify({ error: "Article ID and file type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch article
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*, author_id")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin or the article author
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    const isAdmin = roleData?.role === "admin";
    const isAuthor = article.author_id === userId;

    if (!isAdmin && !isAuthor) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let filePath: string | null = null;
    let bucket: string = "documents";

    if (fileType === "document") {
      filePath = article.document_url || null;
    } else if (fileType === "certificate") {
      bucket = "certificates";
      if (article.certificate_url) {
        const urlParts = article.certificate_url.split("/");
        filePath = urlParts[urlParts.length - 1].split("?")[0];
      }
    } else if (fileType === "review_report") {
      bucket = "review-reports";
      filePath = article.review_report_url || null;
    } else if (fileType === "formatted_document") {
      bucket = "formatted-articles";
      filePath = article.formatted_document_url || null;
    } else if (fileType === "galley_proof_revision") {
      bucket = "formatted-articles";
      filePath = article.galley_proof_revision_url || null;
    } else if (fileType === "copyright_form") {
      filePath = article.copyright_form_url || null;
    }

    if (!filePath) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate signed URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 60 * 60); // 1 hour validity

    if (signedUrlError || !signedUrlData) {
      console.error("Signed URL error:", signedUrlError);
      return new Response(JSON.stringify({ error: "Failed to generate download URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generated download URL for ${fileType} of article ${articleId}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: signedUrlData.signedUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Get document URL error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to retrieve document. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
