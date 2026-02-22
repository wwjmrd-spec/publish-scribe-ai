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
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { articleId } = body;

    let articles: any[] = [];

    if (articleId) {
      // Manual trigger: send reminder for a specific article
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, status, profiles:author_id (full_name, email)")
        .eq("id", articleId)
        .eq("status", "pending_fee")
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Article not found or not in pending_fee status" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      articles = [data];
    } else {
      // Auto trigger (cron): find all articles pending_fee for more than 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("articles")
        .select("id, title, reference_number, author_id, status, updated_at, profiles:author_id (full_name, email)")
        .eq("status", "pending_fee")
        .lt("updated_at", twentyFourHoursAgo);

      if (error) {
        console.error("Error fetching articles:", error);
        throw error;
      }
      articles = data || [];
    }

    console.log(`Found ${articles.length} article(s) to send payment reminders for`);

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
