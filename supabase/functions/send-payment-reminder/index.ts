import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const URGENCY_LABEL: Record<number, string> = {
  1: "Informational",
  2: "Moderate",
  3: "High",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isServiceRole = token === serviceRoleKey;
    // Allow the anon key to call this function as a "cron" caller (no admin powers).
    const isCronCaller = token === supabaseKey;
    let isAdminUser = false;

    if (!isServiceRole && !isCronCaller) {
      const authClient = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader! } },
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub as string;
      const adminCheck = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await adminCheck
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").single();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      isAdminUser = true;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { articleId, all, force } = body as { articleId?: string; all?: boolean; force?: boolean };

    const { data: settingsRow } = await supabase
      .from("reminder_settings")
      .select(
        "frequency_hours, max_days, min_article_age_days, max_article_age_days, email_provider_override, email_from_override, urgency_informational_after_days, urgency_moderate_after_days, urgency_high_after_days, last_fee_submission_date",
      )
      .limit(1).single();

    const frequencyHours = settingsRow?.frequency_hours ?? 24;
    const legacyMaxDays = settingsRow?.max_days ?? 2;
    const minAge = settingsRow?.min_article_age_days ?? 0;
    const maxAge = settingsRow?.max_article_age_days ?? Math.max(legacyMaxDays, 365);
    const providerOverride = settingsRow?.email_provider_override || undefined;
    const fromOverride = settingsRow?.email_from_override || undefined;
    const urgencyInfoAfter = settingsRow?.urgency_informational_after_days ?? 0;
    const urgencyModerateAfter = settingsRow?.urgency_moderate_after_days ?? 3;
    const urgencyHighAfter = settingsRow?.urgency_high_after_days ?? 6;
    const lastFeeDate = settingsRow?.last_fee_submission_date
      ? new Date(settingsRow.last_fee_submission_date as string)
      : null;

    const bypassWindow = isAdminUser || force === true;
    const now = new Date();

    let articles: any[] = [];

    if (articleId) {
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, status, updated_at, page_count, profiles:author_id (full_name, email)")
        .eq("id", articleId)
        .in("status", ["pending_fee", "manuscript_accepted"])
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Article not found or not in pending_fee/manuscript_accepted status" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      articles = [data];
    } else {
      let query = supabase
        .from("articles")
        .select("id, title, reference_number, author_id, status, updated_at, page_count, profiles:author_id (full_name, email)")
        .in("status", ["pending_fee", "manuscript_accepted"]);

      if (!(isAdminUser && all)) {
        query = query.gt("page_count", 2);
      }

      const { data, error } = await query;
      if (error) throw error;

      const frequencyMs = frequencyHours * 60 * 60 * 1000;
      const frequencyAgo = new Date(now.getTime() - frequencyMs).toISOString();

      const filtered: any[] = [];
      for (const art of (data || [])) {
        if (!bypassWindow) {
          const statusChangedAt = new Date(art.updated_at);
          const ageDays = (now.getTime() - statusChangedAt.getTime()) / 86400000;
          if (ageDays < minAge) continue;
          if (ageDays > maxAge) continue;

          const { data: recentReminder } = await supabase
            .from("payment_reminders")
            .select("id").eq("article_id", art.id).gte("sent_at", frequencyAgo).limit(1);
          if (recentReminder && recentReminder.length > 0) continue;
        }
        filtered.push(art);
      }
      articles = filtered;
    }

    console.log(
      `[send-payment-reminder] candidates=${articles.length}, freq=${frequencyHours}h, urgency thresholds=${urgencyInfoAfter}/${urgencyModerateAfter}/${urgencyHighAfter}d, deadline=${
        lastFeeDate ? lastFeeDate.toISOString().slice(0, 10) : "none"
      }, provider=${providerOverride || "default"}, caller=${isServiceRole ? "service" : isCronCaller ? "cron" : isAdminUser ? "admin" : "?"}`,
    );

    let sentCount = 0;
    const errors: string[] = [];
    const skipped: string[] = [];

    for (const article of articles) {
      const profile = article.profiles as any;
      if (!profile?.email) {
        errors.push(`No email for article ${article.reference_number}`);
        continue;
      }

      // Compute days since the article reached the fee-pending stage.
      const statusChangedAt = new Date(article.updated_at);
      const ageDays = Math.floor((now.getTime() - statusChangedAt.getTime()) / 86400000);

      // Determine current urgency level by thresholds (pick highest reached).
      let level = 0;
      if (ageDays >= urgencyInfoAfter) level = 1;
      if (ageDays >= urgencyModerateAfter) level = 2;
      if (ageDays >= urgencyHighAfter) level = 3;

      // Escalate to High if deadline is within 2 days or has passed.
      let daysUntilDeadline: number | null = null;
      if (lastFeeDate) {
        daysUntilDeadline = Math.ceil((lastFeeDate.getTime() - now.getTime()) / 86400000);
        if (daysUntilDeadline <= 2) level = 3;
      }

      if (level < 1) {
        skipped.push(`${article.reference_number}: below info threshold (age=${ageDays}d)`);
        continue;
      }

      // Send each urgency level exactly once per article (unless force/manual articleId).
      if (!articleId && !force) {
        const { data: prior } = await supabase
          .from("payment_reminders")
          .select("id")
          .eq("article_id", article.id)
          .eq("urgency_level", level)
          .limit(1);
        if (prior && prior.length > 0) {
          skipped.push(`${article.reference_number}: level ${level} already sent`);
          continue;
        }
      }

      try {
        const pageCount = (article as any).page_count || 0;
        const pageMessage = pageCount > 2
          ? ` Your article has ${pageCount} pages, which exceeds the 2-page free publication limit.`
          : "";
        const deadlineText = lastFeeDate
          ? lastFeeDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
          : null;

        const { error: emailError } = await supabase.functions.invoke("send-email", {
          body: {
            to: profile.email,
            template: "payment-reminder",
            providerOverride,
            fromOverride,
            data: {
              authorName: profile.full_name || "Author",
              articleTitle: article.title,
              referenceNumber: article.reference_number,
              extraMessage: pageMessage,
              urgencyLevel: level,
              urgencyLabel: URGENCY_LABEL[level],
              deadline: deadlineText,
              daysUntilDeadline,
              daysSinceAcceptance: ageDays,
            },
          },
        });
        if (emailError) {
          errors.push(`Failed to send to ${profile.email}: ${emailError.message}`);
        } else {
          sentCount++;
          await supabase.from("payment_reminders").insert({
            article_id: article.id,
            reminder_type: articleId ? "manual" : "auto",
            urgency_level: level,
          });
        }
      } catch (err: any) {
        errors.push(`Error sending to ${profile.email}: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      totalArticles: articles.length,
      remindersSent: sentCount,
      providerUsed: providerOverride || "default",
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error: any) {
    console.error("Error in send-payment-reminder:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
