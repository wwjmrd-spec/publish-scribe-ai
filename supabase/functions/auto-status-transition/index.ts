import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function decodeJwtPayload(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isAuthorizedSchedulerToken({
  token, serviceRoleKey, anonKey, projectRef,
}: { token: string | null; serviceRoleKey: string; anonKey: string; projectRef: string; }) {
  if (!token) return false;
  // Accept either the service role key OR the anon key, as long as the JWT's
  // `ref` claim matches this project. The scheduler endpoint has no
  // user-controlled input and only runs server-side workflow logic, so the
  // anon key (used by pg_cron) is acceptable here.
  if (token === serviceRoleKey || token === anonKey) return true;
  const claims = decodeJwtPayload(token);
  if (!claims) return false;
  return claims.ref === projectRef && (claims.role === "service_role" || claims.role === "anon");
}


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!isAuthorizedSchedulerToken({ token: token ?? null, serviceRoleKey, anonKey, projectRef })) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }


    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();
    const results = {
      step_submittedToUnderReview: 0,
      step0_aiReviewsTriggered: 0,
      step1_reviewsAutoApproved: 0,
      step2_accepted: 0,
      step2_pendingFee: 0,
      step2_revisionRequested: 0,
      step3_referralRewardEmails: 0,
      errors: [] as string[],
    };

    async function notifyAdmins(title: string, message: string, link?: string) {
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) {
        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id, title, message, type: "info", link,
          });
        }
      }
    }

    async function sendEmail(to: string, template: string, data: Record<string, any>) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ to, template, data }),
        });
      } catch (e) { console.error("sendEmail failed", e); }
    }

    // ===== STEP -1: Move 'submitted' articles older than 5 minutes to 'under_review' =====
    {
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const { data: toReview, error } = await supabase
        .from("articles")
        .select("id")
        .eq("status", "submitted")
        .eq("automation_paused", false)
        .lte("submission_date", fiveMinAgo)
        .limit(100);
      if (error) {
        results.errors.push(`StepUR fetch: ${error.message}`);
      } else if (toReview?.length) {
        const ids = toReview.map((a: any) => a.id);
        const { error: updErr } = await supabase
          .from("articles")
          .update({ status: "under_review" })
          .in("id", ids);
        if (updErr) results.errors.push(`StepUR update: ${updErr.message}`);
        else results.step_submittedToUnderReview = ids.length;
      }
    }

    // ===== STEP 0: Trigger AI review for newly submitted articles missing reviews =====
    //               Also retry page-count extraction for articles missing page_count.
    {
      const { data: pending, error } = await supabase
        .from("articles")
        .select("id, document_url, page_count, article_reviews(id)")
        .in("status", ["submitted", "under_review", "revised_submitted"])
        .eq("automation_paused", false)
        .not("document_url", "is", null)
        .limit(20);

      if (error) {
        results.errors.push(`Step0 fetch: ${error.message}`);
      } else if (pending?.length) {
        for (const art of pending as any[]) {
          const needsReview = !art.article_reviews || art.article_reviews.length === 0;
          const needsPageCount = !art.page_count;
          if (!needsReview && !needsPageCount) continue;

          // Use retry-article-analysis to handle both retries (page count + ai-review trigger)
          fetch(`${supabaseUrl}/functions/v1/retry-article-analysis`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({ articleId: art.id }),
          }).catch((err) => console.error(`retry-article-analysis failed for ${art.id}:`, err));

          if (needsReview) results.step0_aiReviewsTriggered++;
        }
      }
    }


    // ===== STEP 1: Auto-approve AI reviews older than 6 hours and apply outcome =====
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    // Check 2-page free setting
    const { data: twoPageFreeSetting } = await supabase
      .from("admin_settings").select("setting_value").eq("setting_key", "two_page_free_enabled").maybeSingle();
    const twoPageFreeEnabled = twoPageFreeSetting?.setting_value !== "false";

    // Load admin-configurable automation score thresholds
    const { data: thresholdRows } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["auto_accept_threshold", "auto_revision_threshold"]);
    const thresholdMap: Record<string, string> = {};
    (thresholdRows ?? []).forEach((r: any) => (thresholdMap[r.setting_key] = r.setting_value));
    const acceptThreshold = Number(thresholdMap.auto_accept_threshold ?? "70");
    const revisionThreshold = Number(thresholdMap.auto_revision_threshold ?? "40");

    {
      const { data: reviews, error } = await supabase
        .from("article_reviews")
        .select("id, article_id, report_url, overall_score, detailed_feedback, summary, reviewed_at, approved")
        .eq("approved", false)
        .not("reviewed_at", "is", null)
        .lte("reviewed_at", sixHoursAgo)
        .limit(50);


      if (error) {
        results.errors.push(`Step1 fetch: ${error.message}`);
      } else if (reviews?.length) {
        for (const review of reviews) {
          try {
            // Fetch article + author
            const { data: article } = await supabase
              .from("articles")
              .select("id, title, reference_number, author_id, status, page_count, automation_paused, profiles:author_id (full_name, email)")
              .eq("id", review.article_id)
              .maybeSingle();
            if (!article) continue;
            if ((article as any).automation_paused) continue;

            const profile = (article as any).profiles;
            const authorEmail = profile?.email as string | undefined;
            const authorName = (profile?.full_name as string) || "Author";
            const pageCount = (article as any).page_count || 0;
            const overall = Number(review.overall_score ?? 0);

            // (a) Approve & publish review
            const reviewGeneratedStatus = article.status === "revised_submitted"
              ? "revised_review_generated" : "ai_review_generated";

            await supabase.from("articles")
              .update({ review_report_url: review.report_url, status: reviewGeneratedStatus })
              .eq("id", article.id);

            await supabase.from("article_reviews")
              .update({ approved: true, approved_at: new Date().toISOString() })
              .eq("id", review.id);

            results.step1_reviewsAutoApproved++;

            await supabase.from("notifications").insert({
              user_id: article.author_id,
              title: "AI Review Report Ready 📊",
              message: `The review report for "${article.title}" is now available.`,
              type: "info", link: "/author/articles",
            });

            if (authorEmail) {
              await sendEmail(authorEmail, "review-report-ready", {
                authorName, articleTitle: article.title,
                referenceNumber: article.reference_number,
                overallScore: overall,
                recommendation: ((review.detailed_feedback as any)?.recommendation || "N/A").replace(/_/g, " "),
                isLowScore: overall < 90,
              });
            }

            // (b) Determine outcome based on admin-configured score thresholds
            const meetsAcceptance = overall >= acceptThreshold;
            const meetsRevision = overall >= revisionThreshold;

            if (meetsAcceptance) {
              // Manuscript accepted
              await supabase.from("articles").update({
                status: "manuscript_accepted",
                manuscript_accepted_email_sent_at: new Date().toISOString(),
              }).eq("id", article.id);
              results.step2_accepted++;

              await supabase.from("notifications").insert({
                user_id: article.author_id,
                title: "Manuscript Accepted! 🎉",
                message: `Your manuscript "${article.title}" has been accepted!`,
                type: "success", link: "/author/articles",
              });
              await notifyAdmins("Manuscript Accepted ✅",
                `Article "${article.title}" (${article.reference_number}) auto-accepted (score ${overall}% ≥ ${acceptThreshold}%).`,
                `/admin/articles/${article.id}`);
              if (authorEmail) {
                await sendEmail(authorEmail, "status-update", {
                  authorName, articleTitle: article.title,
                  referenceNumber: article.reference_number,
                  newStatus: "Manuscript Accepted",
                  message: "Congratulations! Your manuscript has been accepted for publication.",
                });
              }

              // If article requires fee (>2 pages OR free disabled), move to pending_fee
              const requiresFee = pageCount > 2 || !twoPageFreeEnabled;
              if (requiresFee) {
                await supabase.from("articles").update({
                  status: "pending_fee",
                  fee_reminder_email_sent_at: new Date().toISOString(),
                  automation_paused: true,
                }).eq("id", article.id);
                results.step2_pendingFee++;

                await supabase.from("notifications").insert({
                  user_id: article.author_id,
                  title: "Publication Fee Pending 💳",
                  message: `Your article "${article.title}" (${pageCount} pages) requires a publication fee.`,
                  type: "warning", link: "/author/cart",
                });
                await notifyAdmins("Article Pending Fee 💳",
                  `Article "${article.title}" (${article.reference_number}) is pending fee. Automation paused.`,
                  `/admin/articles/${article.id}`);
                if (authorEmail) {
                  await sendEmail(authorEmail, "status-update", {
                    authorName, articleTitle: article.title,
                    referenceNumber: article.reference_number,
                    newStatus: "Pending Fee",
                    message: `Your article has ${pageCount} pages and requires a publication fee to proceed. Please pay your publication fee to continue.`,
                  });
                }
              } else {
                // Free tier — pause automation now
                await supabase.from("articles").update({ automation_paused: true }).eq("id", article.id);
              }
            } else if (meetsRevision) {
              // Mid score — request manuscript revision and pause
              await supabase.from("articles").update({
                status: "revision_requested",
                automation_paused: true,
              }).eq("id", article.id);
              results.step2_revisionRequested++;

              await supabase.from("notifications").insert({
                user_id: article.author_id,
                title: "Manuscript Revision Required ✏️",
                message: `Your article "${article.title}" requires revision. Please review the feedback and resubmit.`,
                type: "warning", link: "/author/articles",
              });
              await notifyAdmins("Revision Requested ✏️",
                `Article "${article.title}" (${article.reference_number}) auto-flagged for revision (score ${overall}%, thresholds ${revisionThreshold}%–${acceptThreshold}%). Automation paused.`,
                `/admin/articles/${article.id}`);
              if (authorEmail) {
                await sendEmail(authorEmail, "manuscript-revise", {
                  authorName, articleTitle: article.title,
                  referenceNumber: article.reference_number,
                  pageCount: pageCount || "N/A",
                });
              }
            } else {
              // Below revision threshold — auto-reject and pause
              await supabase.from("articles").update({
                status: "rejected",
                automation_paused: true,
              }).eq("id", article.id);
              (results as any).step2_rejected = ((results as any).step2_rejected || 0) + 1;

              await supabase.from("notifications").insert({
                user_id: article.author_id,
                title: "Manuscript Rejected ❌",
                message: `Your article "${article.title}" did not meet the minimum review score and has been rejected.`,
                type: "warning", link: "/author/articles",
              });
              await notifyAdmins("Manuscript Auto-Rejected ❌",
                `Article "${article.title}" (${article.reference_number}) auto-rejected (score ${overall}% < ${revisionThreshold}%). Automation paused.`,
                `/admin/articles/${article.id}`);
              if (authorEmail) {
                await sendEmail(authorEmail, "status-update", {
                  authorName, articleTitle: article.title,
                  referenceNumber: article.reference_number,
                  newStatus: "Rejected",
                  message: `Unfortunately, your manuscript scored ${overall}% in AI review, which is below our minimum threshold of ${revisionThreshold}%. The submission has been rejected.`,
                });
              }
            }
          } catch (e: any) {
            results.errors.push(`Step1 review ${review.id}: ${e?.message || e}`);
          }
        }
      }
    }

    // ===== STEP 3: Referral reward emails =====
    {
      const { data: rewardedReferrals, error } = await supabase
        .from("referrals")
        .select("id, referrer_id, referred_id, rewarded_at")
        .eq("reward_granted", true)
        .is("referral_email_sent_at", null);

      if (error) {
        results.errors.push(`Step3 fetch: ${error.message}`);
      } else if (rewardedReferrals?.length) {
        for (const ref of rewardedReferrals) {
          try {
            const { data: claimed, error: claimErr } = await supabase
              .from("referrals")
              .update({ referral_email_sent_at: new Date().toISOString() })
              .eq("id", ref.id)
              .is("referral_email_sent_at", null)
              .select("id").maybeSingle();
            if (claimErr || !claimed) continue;

            const { data: referrerProfile } = await supabase.from("profiles")
              .select("full_name, email").eq("id", ref.referrer_id).single();
            const { data: referredProfile } = await supabase.from("profiles")
              .select("full_name, email").eq("id", ref.referred_id).single();
            if (!referrerProfile || !referredProfile) continue;

            const { count: totalRewarded } = await supabase.from("referrals")
              .select("id", { count: "exact", head: true })
              .eq("referrer_id", ref.referrer_id).eq("reward_granted", true);

            let discountAmount = 10;
            if ((totalRewarded || 0) >= 3) discountAmount = 50;
            else if ((totalRewarded || 0) === 2) discountAmount = 30;

            const { data: referrerCodes } = await supabase.from("discount_codes")
              .select("code, discount_value").eq("created_by", ref.referrer_id)
              .like("code", "REF-%").order("created_at", { ascending: false }).limit(1);
            const referrerCode = referrerCodes?.[0]?.code || "N/A";

            const { data: referredCodes } = await supabase.from("discount_codes")
              .select("code, discount_value").eq("created_by", ref.referred_id)
              .like("code", "WELCOME-%").order("created_at", { ascending: false }).limit(1);
            const referredCode = referredCodes?.[0]?.code || "N/A";

            await sendEmail(referrerProfile.email, "referral-reward", {
              rewardType: "referrer",
              referrerName: referrerProfile.full_name,
              referredName: referredProfile.full_name,
              referralDiscountCode: referrerCode,
              referralDiscountAmount: discountAmount,
            });
            await sendEmail(referredProfile.email, "referral-reward", {
              rewardType: "referred",
              referredName: referredProfile.full_name,
              referrerName: referrerProfile.full_name,
              referralDiscountCode: referredCode,
              referralDiscountAmount: 10,
            });
            results.step3_referralRewardEmails++;
          } catch (err: any) {
            results.errors.push(`Step3 email error: ${err.message}`);
          }
        }
      }
    }

    console.log("Auto status transition results:", JSON.stringify(results));
    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Auto status transition error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
