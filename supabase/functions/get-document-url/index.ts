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

      // Server-side quota enforcement (authors only; admins bypass quota but still count).
      // NEW POLICY:
      //   Free plan  -> 1 free review-report download PER ARTICLE. After that, Rs 100/download.
      //                 (Signed URL only issued after payment; frontend collects payment.)
      //   Pro plan   -> 10 review-report downloads per calendar month. No per-article limit.
      if (!isAdmin) {
        const PRO_LIMIT = 10;

        const { data: sub } = await supabase
          .from("user_subscriptions")
          .select("plan_type, is_active, expires_at, review_reports_grant")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();

        const isPro =
          sub?.plan_type === "pro" &&
          sub.is_active &&
          (!sub.expires_at || new Date(sub.expires_at) > new Date());

        const now = new Date();
        const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        if (isPro) {
          const limit = sub?.review_reports_grant ?? PRO_LIMIT;

          const { data: periodRow } = await supabase
            .from("plan_usage")
            .select("review_reports_used")
            .eq("user_id", userId)
            .eq("usage_month", periodKey)
            .maybeSingle();
          const used = periodRow?.review_reports_used ?? 0;

          if (used >= limit) {
            return new Response(
              JSON.stringify({
                error: `Monthly limit reached (${limit} review reports/month).`,
                quotaExceeded: true,
              }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          await supabase.rpc("increment_plan_usage", {
            p_user_id: userId,
            p_field: "review_reports_used",
            p_usage_month: periodKey,
          });

          // Also bump the per-article counter so admins see accurate totals.
          await supabase
            .from("articles")
            .update({
              review_report_download_count: (article.review_report_download_count ?? 0) + 1,
            })
            .eq("id", articleId);
        } else {
          // Free plan — per-article 1 free download; then Rs 100/download.
          const usedFree = !!article.free_review_report_downloaded;
          const paid = !!article.review_report_paid;

          if (usedFree && !paid) {
            return new Response(
              JSON.stringify({
                error: "Payment required to download this review report.",
                paymentRequired: true,
                priceInr: 100,
                articleId,
              }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          // Consume either the free download or the one-time paid download.
          const patch: Record<string, unknown> = {
            review_report_download_count: (article.review_report_download_count ?? 0) + 1,
          };
          if (!usedFree) patch.free_review_report_downloaded = true;
          if (paid) {
            // Paid download is single-use: reset paid flag once consumed.
            patch.review_report_paid = false;
          }
          await supabase.from("articles").update(patch).eq("id", articleId);

          // Track free-plan period usage so the admin "Free Plan Downloads" widget stays accurate.
          await supabase.rpc("increment_plan_usage", {
            p_user_id: userId,
            p_field: "review_reports_used",
            p_usage_month: periodKey,
          });
        }
      }


    } else if (fileType === "pending_review_report") {
      // Admin-only: preview the not-yet-approved review PDF stored on article_reviews
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      bucket = "review-reports";
      const { data: latestReview } = await supabase
        .from("article_reviews")
        .select("report_url")
        .eq("article_id", articleId)
        .order("reviewed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      filePath = (latestReview as any)?.report_url || null;
    } else if (fileType === "formatted_document") {
      bucket = "formatted-articles";
      filePath = article.formatted_document_url || null;
    } else if (fileType === "formatted_word") {
      bucket = "formatted-articles";
      filePath = (article as any).formatted_docx_url || null;
    } else if (fileType === "galley_proof_revision") {
      bucket = "formatted-articles";
      filePath = article.galley_proof_revision_url || null;
    } else if (fileType === "copyright_form") {
      filePath = article.copyright_form_url || null;
    } else if (fileType === "galley_proof_word") {
      bucket = "formatted-articles";
      filePath = article.galley_proof_word_url || null;
    } else if (fileType === "galley_proof_pdf") {
      bucket = "formatted-articles";
      filePath = article.galley_proof_pdf_url || null;
    }

    if (!filePath) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build download filename using reference number
    const refNum = article.reference_number || "article";
    const safeRef = refNum.replace(/[^a-zA-Z0-9_-]/g, "_");
    const extensionMap: Record<string, string> = {
      document: ".docx",
      certificate: ".pdf",
      review_report: ".pdf",
      pending_review_report: ".pdf",
      formatted_document: ".pdf",
      formatted_word: ".docx",
      galley_proof_revision: ".docx",
      galley_proof_word: ".docx",
      galley_proof_pdf: ".pdf",
      copyright_form: ".pdf",
    };
    const ext = extensionMap[fileType] || "";
    const downloadFilename = `${safeRef}_${fileType}${ext}`;

    // Generate signed URL with download disposition
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 60 * 60, {
        download: downloadFilename,
      });

    if (signedUrlError || !signedUrlData) {
      console.error("Signed URL error:", signedUrlError);
      return new Response(JSON.stringify({ error: "Failed to generate download URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generated download URL for ${fileType} of article ${articleId} as ${downloadFilename}`);

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
