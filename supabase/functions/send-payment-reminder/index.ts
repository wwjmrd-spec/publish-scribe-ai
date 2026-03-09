import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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

    // Auth: only allow service role key (cron/admin)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || token !== serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { articleId } = body;

    // Fetch reminder settings
    const { data: settingsRow } = await supabase
      .from("reminder_settings")
      .select("frequency_hours, max_days")
      .limit(1)
      .single();

    const frequencyHours = settingsRow?.frequency_hours ?? 24;
    const maxDays = settingsRow?.max_days ?? 2;

    let articles: any[] = [];

    if (articleId) {
      // Manual trigger: send reminder for a specific article
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, status, updated_at, profiles:author_id (full_name, email)")
        .eq("id", articleId)
        .in("status", ["pending_fee", "manuscript_accepted"])
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Article not found or not in pending_fee/manuscript_accepted status" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Check if article is still within the max_days window
      const statusChangedAt = new Date(data.updated_at);
      const cutoffDate = new Date(statusChangedAt.getTime() + maxDays * 24 * 60 * 60 * 1000);
      if (new Date() > cutoffDate) {
        return new Response(
          JSON.stringify({ error: `Reminder window expired (max ${maxDays} days after pending_fee)` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      articles = [data];
    } else {
      // Auto trigger (cron): find all articles pending_fee
      // that are within the max_days window from when they became pending_fee
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, status, updated_at, profiles:author_id (full_name, email)")
        .in("status", ["pending_fee", "manuscript_accepted"]);

      if (error) {
        console.error("Error fetching articles:", error);
        throw error;
      }

      const now = new Date();
      const frequencyMs = frequencyHours * 60 * 60 * 1000;
      const frequencyAgo = new Date(now.getTime() - frequencyMs).toISOString();

      // Filter: within max_days window AND no reminder sent within frequency period
      const filteredArticles = [];
      for (const art of (data || [])) {
        const statusChangedAt = new Date(art.updated_at);
        const cutoffDate = new Date(statusChangedAt.getTime() + maxDays * 24 * 60 * 60 * 1000);

        // Skip if past the max_days window
        if (now > cutoffDate) continue;

        const { data: recentReminder } = await supabase
          .from("payment_reminders")
          .select("id")
          .eq("article_id", art.id)
          .gte("sent_at", frequencyAgo)
          .limit(1);

        if (!recentReminder || recentReminder.length === 0) {
          filteredArticles.push(art);
        }
      }
      articles = filteredArticles;
    }

    console.log(`Found ${articles.length} article(s) to send payment reminders for (frequency: ${frequencyHours}h, max: ${maxDays} days)`);

    let sentCount = 0;
    const errors: string[] = [];

    for (const article of articles) {
      const profile = article.profiles as any;
      if (!profile?.email) {
        errors.push(`No email for article ${article.reference_number}`);
        continue;
      }

      try {
        const { error: emailError } = await supabase.functions.invoke("send-email", {
          body: {
            to: profile.email,
            template: "payment-reminder",
            data: {
              authorName: profile.full_name || "Author",
              articleTitle: article.title,
              referenceNumber: article.reference_number,
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
          });
          console.log(`Payment reminder sent to ${profile.email} for article ${article.reference_number}`);
        }
      } catch (err: any) {
        errors.push(`Error sending to ${profile.email}: ${err.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalArticles: articles.length,
        remindersSent: sentCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-payment-reminder:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
