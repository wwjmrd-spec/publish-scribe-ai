import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Body = {
  articleId?: string;
  action?: "approve" | "corrections";
  content?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body.articleId || !body.action) return json({ error: "Article ID and action are required" }, 400);
    if (body.action === "corrections" && !body.content?.trim()) return json({ error: "Correction content is required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: article, error: articleError } = await admin
      .from("articles")
      .select("*, profiles:author_id(full_name,email)")
      .eq("id", body.articleId)
      .single();
    if (articleError || !article) return json({ error: "Article not found" }, 404);
    if (article.author_id !== userData.user.id) return json({ error: "Forbidden" }, 403);

    const authorProfile = Array.isArray(article.profiles) ? article.profiles[0] : article.profiles;
    const authorName = article.author_name || authorProfile?.full_name || "Author";
    const authorEmail = article.notification_email || authorProfile?.email || userData.user.email;
    const now = new Date().toISOString();

    const update = body.action === "approve"
      ? {
          galley_proof_consent: true,
          galley_proof_status: "approved",
          status: "galley_proof_approved",
          in_publish_queue: true,
          publish_queue_added_at: now,
        }
      : {
          author_revision_html: body.content,
          author_revision_submitted_at: now,
          galley_proof_status: "revision_submitted",
          status: "galley_proof_revised",
        };

    const { error: updateError } = await admin.from("articles").update(update).eq("id", body.articleId);
    if (updateError) throw updateError;

    const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
    const adminNotifications = (admins || []).map((adminRow: { user_id: string }) => ({
      user_id: adminRow.user_id,
      title: body.action === "approve" ? "Galley Proof Approved ✅" : "Galley Proof Corrections Received 📝",
      message: body.action === "approve"
        ? `${authorName} approved the galley proof for "${article.title}" (${article.reference_number}). It is ready for final processing.`
        : `${authorName} sent corrected galley proof content for "${article.title}" (${article.reference_number}).`,
      type: body.action === "approve" ? "success" : "info",
      link: `/admin/articles/${article.id}`,
    }));
    if (adminNotifications.length) {
      const { error: notifyError } = await admin.from("notifications").insert(adminNotifications);
      if (notifyError) throw notifyError;
    }

    const { data: adminEmailSetting } = await admin
      .from("admin_settings")
      .select("setting_value")
      .in("setting_key", ["admin_notification_email", "admin_email"])
      .limit(1)
      .maybeSingle();
    const adminEmail = adminEmailSetting?.setting_value || "shubhmeena23@gmail.com";
    const template = body.action === "approve" ? "galley-proof-approved" : "galley-proof-author-corrections";
    const emailData = {
      articleId: article.id,
      articleTitle: article.title,
      referenceNumber: article.reference_number,
      authorName,
      authorEmail,
      submissionDate: new Date().toLocaleDateString(),
    };

    await Promise.allSettled([
      fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: adminEmail, template, data: emailData, isAdmin: true }),
      }),
      authorEmail
        ? fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ to: authorEmail, template, data: emailData, isAdmin: false }),
          })
        : Promise.resolve(),
    ]);

    return json({ success: true });
  } catch (error: any) {
    console.error("submit-galley-response failed:", error?.message || error);
    return json({ error: error?.message || "Failed to submit galley response" }, 500);
  }
});