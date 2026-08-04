import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (token !== serviceRoleKey && token !== anonKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const sent: string[] = [];
  const errors: string[] = [];

  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, title, reference_number, author_id, profiles:author_id (full_name, email)")
    .eq("status", "manuscript_accepted")
    .gte("submission_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  for (const art of (articles ?? []) as any[]) {
    try {
      const email = art.profiles?.email;
      const authorName = art.profiles?.full_name || "Author";

      await supabase.from("notifications").insert({
        user_id: art.author_id,
        title: "Manuscript Accepted! 🎉",
        message: `Your manuscript "${art.title}" has been accepted!`,
        type: "success",
        link: "/author/articles",
      });

      if (email) {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            to: email,
            template: "article-status-change",
            data: {
              authorName,
              articleTitle: art.title,
              referenceNumber: art.reference_number,
              status: "manuscript_accepted",
            },
          }),
        });
        if (!res.ok) errors.push(`${art.reference_number}: ${await res.text()}`);
        else sent.push(art.reference_number);
      }
    } catch (e: any) {
      errors.push(`${art.reference_number}: ${e?.message || e}`);
    }
  }

  return new Response(JSON.stringify({ total: articles?.length ?? 0, sent, errors }), {
    status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
