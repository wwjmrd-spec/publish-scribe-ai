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
  token,
  anonKey,
  publishableKeys,
  serviceRoleKey,
  projectRef,
}: {
  token: string | null;
  anonKey: string;
  publishableKeys: string[];
  serviceRoleKey: string;
  projectRef: string;
}) {
  if (!token) return false;
  if (token === anonKey || token === serviceRoleKey || publishableKeys.includes(token)) return true;

  const claims = decodeJwtPayload(token);
  if (!claims) return false;

  return (
    claims.ref === projectRef &&
    (claims.role === "anon" || claims.role === "service_role")
  );
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
    const publishableKeys = [
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
      Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY"),
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15amJiYnl0Ynp6enNhYWlvaHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjMyMjksImV4cCI6MjA4NTY5OTIyOX0.9aPaE465Gbtchb2FHN6hlxmM2UjfQbGXWHnOyw1zDvY",
    ].filter((value): value is string => Boolean(value));

    // Authenticate scheduled requests safely
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!isAuthorizedSchedulerToken({ token: token ?? null, anonKey, publishableKeys, serviceRoleKey, projectRef })) {
      console.error("Unauthorized scheduler request");
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
      step2_toManuscriptAccepted: 0,
      step3_toPendingFee: 0,
      step4_referralRewardEmails: 0,
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
        .select("id, title, reference_number, author_id, copyright_form_url, profiles:author_id (full_name, email)")
        .eq("status", "submitted")
        .eq("automation_paused", false)
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
            if (profile?.email && !article.copyright_form_url) {
              await sendEmail(profile.email, "status-update", {
                authorName: profile.full_name || "Author",
                articleTitle: article.title,
                referenceNumber: article.reference_number,
                newStatus: "Under Review",
                message: "Your article has been received and is now under review by our editorial team.",
              });
              await sendEmail(profile.email, "copyright-form-request", {
                authorName: profile.full_name || "Author",
                articleTitle: article.title,
                referenceNumber: article.reference_number,
              });
            } else if (profile?.email) {
              await sendEmail(profile.email, "status-update", {
                authorName: profile.full_name || "Author",
                articleTitle: article.title,
                referenceNumber: article.reference_number,
                newStatus: "Under Review",
                message: "Your article has been received and is now under review by our editorial team.",
              });
            }
            if (!article.copyright_form_url) {
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
    }

    // ===== STEP 2: under_review → manuscript_accepted (2 hours) =====
    // Score thresholds: 1-page articles NEVER auto-accepted, ≤2 pages need ≥90%, >2 pages need ≥80%
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, page_count, profiles:author_id (full_name, email)")
        .eq("status", "under_review")
        .eq("automation_paused", false)
        .lte("updated_at", twoHoursAgo);

      if (error) {
        results.errors.push(`Step2 fetch: ${error.message}`);
      } else if (articles?.length) {
        const eligibleForAcceptance: any[] = [];

        for (const article of articles) {
          const pageCount = (article as any).page_count || 0;

          // 1-page articles are NEVER auto-accepted
          if (pageCount <= 1) {
            console.log(`Skipping article ${article.id}: 1-page articles cannot be auto-accepted`);
            continue;
          }

          // Check review score
          const { data: review } = await supabase
            .from("article_reviews")
            .select("overall_score")
            .eq("article_id", article.id)
            .order("reviewed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const overallScore = review?.overall_score ?? 0;
          const requiredScore = pageCount <= 2 ? 90 : 80;

          if (overallScore < requiredScore) {
            console.log(`Skipping article ${article.id}: score ${overallScore} below ${requiredScore}% threshold (${pageCount} pages)`);
            continue;
          }

          eligibleForAcceptance.push(article);
        }

        if (eligibleForAcceptance.length) {
          const ids = eligibleForAcceptance.map((a: any) => a.id);
          const { error: updateErr } = await supabase
            .from("articles")
            .update({ status: "manuscript_accepted" })
            .in("id", ids);

          if (updateErr) {
            results.errors.push(`Step2 update: ${updateErr.message}`);
          } else {
            results.step2_toManuscriptAccepted = ids.length;

            for (const article of eligibleForAcceptance) {
              const profile = (article as any).profiles;

              // Track manuscript accepted email sent
              await supabase.from("articles").update({ manuscript_accepted_email_sent_at: new Date().toISOString() }).eq("id", article.id);

              await supabase.from("notifications").insert({
                user_id: article.author_id,
                title: "Manuscript Accepted! 🎉",
                message: `Your manuscript "${article.title}" has been accepted!`,
                type: "success",
                link: "/author/articles",
              });

              await notifyAdmins(
                "Manuscript Accepted ✅",
                `Article "${article.title}" (${article.reference_number}) has been accepted.`,
                `/admin/articles/${article.id}`
              );

              if (profile?.email) {
                await sendEmail(profile.email, "status-update", {
                  authorName: profile.full_name || "Author",
                  articleTitle: article.title,
                  referenceNumber: article.reference_number,
                  newStatus: "Manuscript Accepted",
                  message: "Congratulations! Your manuscript has been accepted for publication.",
                });
              }
            }
          }
        }
      }
    }

    // ===== STEP 3: manuscript_accepted (5 min) → pending_fee (NORMAL publications) =====
    // Check if 2-page free setting is enabled
    const { data: twoPageFreeSetting } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "two_page_free_enabled")
      .maybeSingle();
    const twoPageFreeEnabled = twoPageFreeSetting?.setting_value !== 'false'; // default true

    {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, updated_at, publication_type, page_count, profiles:author_id (full_name, email)")
        .eq("status", "manuscript_accepted")
        .eq("publication_type", "normal")
        .eq("automation_paused", false)
        .lte("updated_at", fiveMinAgo);

      if (error) {
        results.errors.push(`Step3 fetch: ${error.message}`);
      } else if (articles?.length) {
        // If 2-page free is enabled, only articles >2 pages go to pending_fee
        // If disabled, ALL articles go to pending_fee
        const eligibleArticles = twoPageFreeEnabled
          ? articles.filter((a: any) => (a.page_count || 0) > 2)
          : articles;
        
        if (eligibleArticles.length) {
          const ids = eligibleArticles.map((a: any) => a.id);
          const { error: updateErr } = await supabase
            .from("articles")
            .update({ status: "pending_fee" })
            .in("id", ids);

          if (updateErr) {
            results.errors.push(`Step3 update: ${updateErr.message}`);
          } else {
            results.step3_toPendingFee = ids.length;
            for (const article of eligibleArticles) {
              const profile = (article as any).profiles;
              const pageCount = (article as any).page_count || 0;
              // Track fee reminder email sent
              await supabase.from("articles").update({ fee_reminder_email_sent_at: new Date().toISOString() }).eq("id", article.id);
              // Author notification
              await supabase.from("notifications").insert({
                user_id: article.author_id,
                title: "Publication Fee Pending 💳",
                message: twoPageFreeEnabled
                  ? `Your article "${article.title}" has ${pageCount} pages which exceeds the 2-page free publication limit. Please pay the publication fee to proceed.`
                  : `Your article "${article.title}" requires a publication fee to proceed.`,
                type: "warning",
                link: "/author/cart",
              });
              // Admin notification
              await notifyAdmins(
                "Article Pending Fee 💳",
                `Article "${article.title}" (${article.reference_number}) has ${pageCount} pages and is now pending fee payment.`,
                `/admin/articles/${article.id}`
              );
              // Author email
              if (profile?.email) {
                await sendEmail(profile.email, "status-update", {
                  authorName: profile.full_name || "Author",
                  articleTitle: article.title,
                  referenceNumber: article.reference_number,
                  newStatus: "Pending Fee",
                  message: twoPageFreeEnabled
                    ? `Your article has ${pageCount} pages, which exceeds the 2-page free publication limit. Articles with more than 2 pages require a publication fee. Please pay your publication fee to proceed with the publication process.`
                    : `Your article requires a publication fee to proceed with publication. Please pay your publication fee to continue.`,
                });
              }
            }
          }
        }
      }
    }

    // ===== STEP 4: Send referral reward emails for recently rewarded referrals =====
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

            results.step4_referralRewardEmails++;
          } catch (err: any) {
            results.errors.push(`Step4 email error: ${err.message}`);
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
