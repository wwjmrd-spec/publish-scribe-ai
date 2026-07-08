import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleRow?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { articleId } = await req.json();

    if (!articleId) {
      return new Response(JSON.stringify({ error: "articleId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: article, error: fetchError } = await adminClient
      .from("articles")
      .select(`
        id,
        title,
        reference_number,
        page_count,
        author_id,
        profiles:author_id (full_name, email)
      `)
      .eq("id", articleId)
      .single();

    if (fetchError || !article) {
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: updatedArticle, error: updateError } = await adminClient
      .from("articles")
      .update({
        status: "revision_requested",
        updated_at: new Date().toISOString(),
      })
      .eq("id", articleId)
      .select("id, status")
      .single();

    if (updateError || updatedArticle?.status !== "revision_requested") {
      console.error("Failed to update article status", updateError, updatedArticle);
      return new Response(JSON.stringify({ error: "Failed to update article status" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("notifications").insert({
      user_id: article.author_id,
      title: "Manuscript Revision Required ✏️",
      message: `Your article "${article.title}" requires revision. Please review the feedback and resubmit.`,
      type: "warning",
      link: "/author/articles",
    });

    const authorProfile = Array.isArray(article.profiles) ? article.profiles[0] : article.profiles;
    let emailSent = false;

    if (authorProfile?.email) {
      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: authorProfile.email,
            template: "manuscript-revise",
            data: {
              authorName: authorProfile.full_name || "Author",
              articleId: article.id,
              articleTitle: article.title,
              referenceNumber: article.reference_number,
              pageCount: article.page_count || "N/A",
            },

          }),
        });

        emailSent = emailResponse.ok;

        if (!emailResponse.ok) {
          console.error("Failed to send manuscript revision email", await emailResponse.text());
        }
      } catch (emailError) {
        console.error("Non-critical email error", emailError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, status: updatedArticle.status, emailSent }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("request-manuscript-revision error", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});