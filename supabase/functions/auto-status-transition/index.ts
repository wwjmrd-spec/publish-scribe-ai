import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const results = { 
      normalToUnderReview: 0, 
      fastTrackToUnderReview: 0, 
      fastTrackAiReviewed: 0,
      errors: [] as string[] 
    };

    // ===== 1. Normal articles: submitted > 10 min ago → under_review =====
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const { data: normalArticles, error: normalErr } = await supabase
      .from("articles")
      .select("id, title, reference_number")
      .eq("status", "submitted")
      .eq("publication_type", "normal")
      .lte("submission_date", tenMinAgo);

    if (normalErr) {
      console.error("Error fetching normal articles:", normalErr);
    } else if (normalArticles?.length) {
      const ids = normalArticles.map(a => a.id);
      const { error: updateErr } = await supabase
        .from("articles")
        .update({ status: "under_review" })
        .in("id", ids);

      if (updateErr) {
        results.errors.push(`Normal update error: ${updateErr.message}`);
      } else {
        results.normalToUnderReview = ids.length;
        console.log(`Moved ${ids.length} normal article(s) to under_review`);
      }
    }

    // ===== 2. Fast track articles: submitted > 5 min ago → under_review =====
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: fastTrackSubmitted, error: ftErr } = await supabase
      .from("articles")
      .select("id, title, reference_number")
      .eq("status", "submitted")
      .eq("publication_type", "fast_track")
      .lte("submission_date", fiveMinAgo);

    if (ftErr) {
      console.error("Error fetching fast track articles:", ftErr);
    } else if (fastTrackSubmitted?.length) {
      const ids = fastTrackSubmitted.map(a => a.id);
      const { error: updateErr } = await supabase
        .from("articles")
        .update({ status: "under_review" })
        .in("id", ids);

      if (updateErr) {
        results.errors.push(`Fast track update error: ${updateErr.message}`);
      } else {
        results.fastTrackToUnderReview = ids.length;
        console.log(`Moved ${ids.length} fast track article(s) to under_review`);
      }
    }

    // ===== 3. Fast track articles: under_review > 2 min ago AND no AI review yet → trigger AI review =====
    const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
    const { data: fastTrackReviewable, error: frErr } = await supabase
      .from("articles")
      .select("id, title, reference_number, author_id, document_url, profiles:author_id (full_name, email)")
      .eq("status", "under_review")
      .eq("publication_type", "fast_track")
      .lte("updated_at", twoMinAgo);

    if (frErr) {
      console.error("Error fetching reviewable fast track articles:", frErr);
    } else if (fastTrackReviewable?.length) {
      for (const article of fastTrackReviewable) {
        // Check if AI review already exists
        const { data: existingReview } = await supabase
          .from("article_reviews")
          .select("id")
          .eq("article_id", article.id)
          .eq("review_type", "ai")
          .limit(1);

        if (existingReview && existingReview.length > 0) {
          continue; // Already reviewed
        }

        console.log(`Triggering AI review for fast track article: ${article.reference_number}`);

        try {
          // Call the ai-review edge function
          const aiReviewResponse = await fetch(`${supabaseUrl}/functions/v1/ai-review`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ articleId: article.id }),
          });

          if (!aiReviewResponse.ok) {
            const errText = await aiReviewResponse.text();
            results.errors.push(`AI review failed for ${article.reference_number}: ${errText}`);
            continue;
          }

          results.fastTrackAiReviewed++;
          console.log(`AI review completed for fast track article: ${article.reference_number}`);

          // Send email to author about auto AI review
          const profile = article.profiles as any;
          if (profile?.email) {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                to: profile.email,
                template: "review-report-ready",
                data: {
                  authorName: profile.full_name || "Author",
                  articleTitle: article.title,
                  referenceNumber: article.reference_number,
                  overallScore: "See report",
                  recommendation: "Auto-reviewed (Fast Track)",
                },
              }),
            });
          }

          // Notify admins
          const { data: admins } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");

          if (admins) {
            for (const admin of admins) {
              await supabase.from("notifications").insert({
                user_id: admin.user_id,
                title: "Fast Track AI Review Complete 🚀",
                message: `Auto AI review completed for fast track article "${article.title}" (${article.reference_number}).`,
                type: "info",
                link: `/admin/articles/${article.id}`,
              });
            }
          }

          // Notify author
          await supabase.from("notifications").insert({
            user_id: article.author_id,
            title: "AI Review Report Ready 📋",
            message: `Your fast track article "${article.title}" has been automatically reviewed. Check your review report.`,
            type: "success",
            link: "/author/articles",
          });

        } catch (err: any) {
          results.errors.push(`AI review error for ${article.reference_number}: ${err.message}`);
        }
      }
    }

    console.log("Auto status transition results:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Auto status transition error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
