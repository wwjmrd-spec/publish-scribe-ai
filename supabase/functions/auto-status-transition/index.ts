import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    // Authenticate: only allow calls with the service role key
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Auto-status-transition invoked");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();
    const results = {
      step1_submittedToUnderReview: 0,
      step2_aiReviewTriggered: 0,
      step3_toManuscriptAccepted: 0,
      step4_toPendingFee: 0,
      errors: [] as string[],
    };

    // ===== Helper: notify all admins =====
    async function notifyAdmins(title: string, message: string, link?: string) {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (admins) {
        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id, title, message, type: "info", link,
          });
        }
      }
    }

    // ===== Helper: send email via edge function =====
    async function sendEmail(to: string, template: string, data: Record<string, any>) {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ to, template, data }),
      });
    }

    // ===== STEP 1: submitted → under_review (5 min) =====
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, profiles:author_id (full_name, email)")
        .eq("status", "submitted")
        .lte("submission_date", fiveMinAgo);

      if (error) {
        results.errors.push(`Step1 fetch: ${error.message}`);
      } else if (articles?.length) {
        const ids = articles.map((a: any) => a.id);
        const { error: updateErr } = await supabase
          .from("articles")
          .update({ status: "under_review" })
          .in("id", ids);

        if (updateErr) {
          results.errors.push(`Step1 update: ${updateErr.message}`);
        } else {
          results.step1_submittedToUnderReview = ids.length;
          for (const article of articles) {
            const profile = (article as any).profiles;
            // Author notification
            await supabase.from("notifications").insert({
              user_id: article.author_id,
              title: "Article Under Review 📝",
              message: `Your article "${article.title}" is now under review.`,
              type: "info",
              link: "/author/articles",
            });
            // Admin notification
            await notifyAdmins(
              "Article Under Review 📝",
              `Article "${article.title}" (${article.reference_number}) is now under review.`,
              `/admin/articles/${article.id}`
            );
            // Author email - status update
            if (profile?.email) {
              await sendEmail(profile.email, "status-update", {
                authorName: profile.full_name || "Author",
                articleTitle: article.title,
                referenceNumber: article.reference_number,
                newStatus: "Under Review",
                message: "Your article has been received and is now under review by our editorial team.",
              });
              // Copyright form request email
              await sendEmail(profile.email, "copyright-form-request", {
                authorName: profile.full_name || "Author",
                articleTitle: article.title,
                referenceNumber: article.reference_number,
              });
            }
            // Copyright form notification
            await supabase.from("notifications").insert({
              user_id: article.author_id,
              title: "Copyright Form Required 📝",
              message: `Please submit the copyright transfer form for "${article.title}".`,
              type: "warning",
              link: "/author/articles",
            });
          }
        }
      }
    }

    // ===== STEP 2: under_review → AI review (2 hours) =====
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, document_url, profiles:author_id (full_name, email)")
        .eq("status", "under_review")
        .lte("updated_at", twoHoursAgo);

      if (error) {
        results.errors.push(`Step2 fetch: ${error.message}`);
      } else if (articles?.length) {
        for (const article of articles) {
          // Check if AI review already exists
          const { data: existing } = await supabase
            .from("article_reviews")
            .select("id")
            .eq("article_id", article.id)
            .eq("review_type", "ai")
            .limit(1);

          if (existing && existing.length > 0) continue;

          try {
            const resp = await fetch(`${supabaseUrl}/functions/v1/ai-review`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
              body: JSON.stringify({ articleId: article.id }),
            });

            if (!resp.ok) {
              results.errors.push(`Step2 AI review failed for ${article.reference_number}: ${await resp.text()}`);
              continue;
            }

            results.step2_aiReviewTriggered++;
            const profile = (article as any).profiles;

            // Author notification
            await supabase.from("notifications").insert({
              user_id: article.author_id,
              title: "Review Report Ready 📋",
              message: `Your Review Report for "${article.title}" is ready.`,
              type: "success",
              link: "/author/articles",
            });
            // Admin notification
            await notifyAdmins(
              "AI Review Completed 🤖",
              `AI Review completed for "${article.title}" (${article.reference_number}).`,
              `/admin/articles/${article.id}`
            );
            // Author email
            if (profile?.email) {
              await sendEmail(profile.email, "review-report-ready", {
                authorName: profile.full_name || "Author",
                articleTitle: article.title,
                referenceNumber: article.reference_number,
                overallScore: "See report",
                recommendation: "AI Review Complete",
              });
            }
          } catch (err: any) {
            results.errors.push(`Step2 error for ${article.reference_number}: ${err.message}`);
          }
        }
      }
    }

    // ===== STEP 3: under_review + AI review exists (5 min old) → manuscript_accepted =====
    {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, profiles:author_id (full_name, email)")
        .eq("status", "under_review");

      if (error) {
        results.errors.push(`Step3 fetch: ${error.message}`);
      } else if (articles?.length) {
        for (const article of articles) {
          const { data: reviews } = await supabase
            .from("article_reviews")
            .select("id, reviewed_at")
            .eq("article_id", article.id)
            .eq("review_type", "ai")
            .limit(1);

          if (!reviews || reviews.length === 0) continue;

          const reviewedAt = new Date(reviews[0].reviewed_at);
          if (now.getTime() - reviewedAt.getTime() < 5 * 60 * 1000) continue;

          const { error: updateErr } = await supabase
            .from("articles")
            .update({ status: "manuscript_accepted" })
            .eq("id", article.id);

          if (updateErr) {
            results.errors.push(`Step3 update ${article.reference_number}: ${updateErr.message}`);
            continue;
          }

          results.step3_toManuscriptAccepted++;
          const profile = (article as any).profiles;

          // Author notification
          await supabase.from("notifications").insert({
            user_id: article.author_id,
            title: "Manuscript Accepted! 🎉",
            message: `Your manuscript "${article.title}" has been accepted!`,
            type: "success",
            link: "/author/articles",
          });
          // Admin notification
          await notifyAdmins(
            "Manuscript Accepted ✅",
            `Article "${article.title}" (${article.reference_number}) has been accepted.`,
            `/admin/articles/${article.id}`
          );
          // Author email
          if (profile?.email) {
            await sendEmail(profile.email, "status-update", {
              authorName: profile.full_name || "Author",
              articleTitle: article.title,
              referenceNumber: article.reference_number,
              newStatus: "Manuscript Accepted",
              message: "Congratulations! Your manuscript has been accepted for publication. Please proceed with the publication fee payment.",
            });
          }
        }
      }
    }

    // ===== STEP 4: manuscript_accepted (5 min) → pending_fee (NORMAL publications only, skip fast_track) =====
    {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, updated_at, publication_type, profiles:author_id (full_name, email)")
        .eq("status", "manuscript_accepted")
        .eq("publication_type", "normal")
        .lte("updated_at", fiveMinAgo);

      if (error) {
        results.errors.push(`Step4 fetch: ${error.message}`);
      } else if (articles?.length) {
        const ids = articles.map((a: any) => a.id);
        const { error: updateErr } = await supabase
          .from("articles")
          .update({ status: "pending_fee" })
          .in("id", ids);

        if (updateErr) {
          results.errors.push(`Step4 update: ${updateErr.message}`);
        } else {
          results.step4_toPendingFee = ids.length;
          for (const article of articles) {
            const profile = (article as any).profiles;
            // Author notification
            await supabase.from("notifications").insert({
              user_id: article.author_id,
              title: "Publication Fee Pending 💳",
              message: `Your publication fee for "${article.title}" is pending. Please pay your publication fee.`,
              type: "warning",
              link: "/author/cart",
            });
            // Admin notification
            await notifyAdmins(
              "Article Pending Fee 💳",
              `Article "${article.title}" (${article.reference_number}) is now pending fee payment.`,
              `/admin/articles/${article.id}`
            );
            // Author email
            if (profile?.email) {
              await sendEmail(profile.email, "status-update", {
                authorName: profile.full_name || "Author",
                articleTitle: article.title,
                referenceNumber: article.reference_number,
                newStatus: "Pending Fee",
                message: "Your publication fee is pending. Please pay your publication fee to proceed with the publication process.",
              });
            }
          }
        }
      }
    }

    // ===== STEP 5: Send referral reward emails for recently rewarded referrals =====
    {
      // Find referrals rewarded in the last 5 minutes that haven't had emails sent yet
      const fiveMinAgoISO = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const { data: rewardedReferrals, error } = await supabase
        .from("referrals")
        .select("id, referrer_id, referred_id, rewarded_at")
        .eq("reward_granted", true)
        .gte("rewarded_at", fiveMinAgoISO);

      if (error) {
        results.errors.push(`Step5 fetch: ${error.message}`);
      } else if (rewardedReferrals?.length) {
        for (const ref of rewardedReferrals) {
          try {
            // Get referrer profile
            const { data: referrerProfile } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", ref.referrer_id)
              .single();

            // Get referred profile
            const { data: referredProfile } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", ref.referred_id)
              .single();

            if (!referrerProfile || !referredProfile) continue;

            // Count total rewarded for this referrer to determine tier
            const { count: totalRewarded } = await supabase
              .from("referrals")
              .select("id", { count: "exact", head: true })
              .eq("referrer_id", ref.referrer_id)
              .eq("reward_granted", true);

            let discountAmount = 10;
            if ((totalRewarded || 0) >= 3) discountAmount = 50;
            else if ((totalRewarded || 0) === 2) discountAmount = 30;

            // Find the referrer's discount code created around the same time
            const { data: referrerCodes } = await supabase
              .from("discount_codes")
              .select("code, discount_value")
              .eq("created_by", ref.referrer_id)
              .like("code", "REF-%")
              .order("created_at", { ascending: false })
              .limit(1);

            const referrerCode = referrerCodes?.[0]?.code || "N/A";

            // Find the referred author's discount code
            const { data: referredCodes } = await supabase
              .from("discount_codes")
              .select("code, discount_value")
              .eq("created_by", ref.referred_id)
              .like("code", "WELCOME-%")
              .order("created_at", { ascending: false })
              .limit(1);

            const referredCode = referredCodes?.[0]?.code || "N/A";

            // Send email to referrer
            await sendEmail(referrerProfile.email, "referral-reward", {
              rewardType: "referrer",
              referrerName: referrerProfile.full_name,
              referredName: referredProfile.full_name,
              referralDiscountCode: referrerCode,
              referralDiscountAmount: discountAmount,
            });

            // Send email to referred author
            await sendEmail(referredProfile.email, "referral-reward", {
              rewardType: "referred",
              referredName: referredProfile.full_name,
              referrerName: referrerProfile.full_name,
              referralDiscountCode: referredCode,
              referralDiscountAmount: 10,
            });
          } catch (err: any) {
            results.errors.push(`Step5 email error: ${err.message}`);
          }
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
