import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type SendGalleyProofBody = {
  action?: "prepare-upload" | "send";
  articleId?: string;
  pdfPath?: string;
  pdfBase64?: string;
  pubVolume?: string;
  pubIssue?: string;
  pubPageRange?: string;
  publicationYear?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (value = "") =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

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

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (role?.role !== "admin") return json({ error: "Forbidden" }, 403);

    const body = (await req.json()) as SendGalleyProofBody;
    const articleId = body.articleId?.trim();
    if (!articleId) return json({ error: "Article ID is required" }, 400);

    if (body.action === "prepare-upload") {
      const { data: existingArticle, error: existingArticleError } = await admin
        .from("articles")
        .select("id")
        .eq("id", articleId)
        .maybeSingle();
      if (existingArticleError || !existingArticle) return json({ error: "Article not found" }, 404);

      const path = `galley-proofs/${articleId}/${crypto.randomUUID()}.pdf`;
      const { data: upload, error: uploadError } = await admin.storage
        .from("formatted-articles")
        .createSignedUploadUrl(path, { upsert: true });
      if (uploadError || !upload) throw uploadError || new Error("Failed to prepare upload");
      return json({ success: true, path, token: upload.token, signedUrl: upload.signedUrl });
    }

    let pdfPath = body.pdfPath?.trim() || "";
    if (!pdfPath && !body.pdfBase64) return json({ error: "PDF is required" }, 400);
    if (!pdfPath) pdfPath = `galley-proofs/${articleId}/${crypto.randomUUID()}.pdf`;
    if (!pdfPath.startsWith(`galley-proofs/${articleId}/`) || !pdfPath.toLowerCase().endsWith(".pdf")) {
      return json({ error: "Invalid galley proof PDF path" }, 400);
    }

    if (body.pdfBase64) {
      const cleanBase64 = body.pdfBase64.includes(",") ? body.pdfBase64.split(",").pop() || "" : body.pdfBase64;
      const binary = atob(cleanBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const { error: uploadError } = await admin.storage
        .from("formatted-articles")
        .upload(pdfPath, bytes, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
    }

    const { data: article, error: articleError } = await admin
      .from("articles")
      .select("*, profiles:author_id(full_name,email)")
      .eq("id", articleId)
      .single();
    if (articleError || !article) return json({ error: "Article not found" }, 404);

    const isFirstPublication = article.publication_type === "fast_track";
    const deadline = new Date();
    if (isFirstPublication) deadline.setHours(deadline.getHours() + 2);
    else deadline.setDate(deadline.getDate() + 2);

    const updatePayload: Record<string, unknown> = {
      galley_proof_word_url: null,
      galley_proof_pdf_url: pdfPath,
      galley_proof_deadline: deadline.toISOString(),
      galley_proof_status: "sent",
      galley_proof_sent_at: new Date().toISOString(),
      galley_proof_consent: false,
      galley_proof_revision_url: null,
      author_revision_html: null,
      author_revision_submitted_at: null,
      status: "galley_proof_sent",
    };
    if (body.pubVolume !== undefined) updatePayload.volume = body.pubVolume;
    if (body.pubIssue !== undefined) updatePayload.issue = body.pubIssue;
    if (body.pubPageRange !== undefined) updatePayload.page_number = body.pubPageRange;
    if (body.publicationYear !== undefined) updatePayload.publication_year = body.publicationYear;

    const { error: updateError } = await admin.from("articles").update(updatePayload).eq("id", articleId);
    if (updateError) throw updateError;

    const { data: signed } = await admin.storage.from("formatted-articles").createSignedUrl(pdfPath, 7 * 24 * 60 * 60);
    const authorProfile = Array.isArray(article.profiles) ? article.profiles[0] : article.profiles;
    const authorEmail = article.notification_email || authorProfile?.email;

    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: article.author_id,
      title: "Galley Proof Ready for Review 📄",
      message: `Your galley proof for "${article.title}" is ready. Please review, edit if needed, or approve it by ${deadline.toLocaleDateString()}.`,
      type: "info",
      link: "/author/articles",
    });
    if (notificationError) throw notificationError;

    let emailSent = false;
    let emailError: string | null = null;
    if (authorEmail) {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: authorEmail,
          template: "galley-proof-review",
          data: {
            authorName: authorProfile?.full_name || article.author_name || "Author",
            articleTitle: article.title,
            referenceNumber: article.reference_number,
            deadline: deadline.toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            wordDownloadUrl: "",
            pdfDownloadUrl: signed?.signedUrl || "",
            isFirstPublication,
            publicationInfo: `${body.publicationYear || article.publication_year || ""}; ${body.pubVolume || article.volume || ""}(${body.pubIssue || article.issue || ""}): ${body.pubPageRange || article.page_number || ""}`,
            publicationMonth: body.publicationYear ? `(${escapeHtml(body.publicationYear)})` : "",
          },
        }),
      });
      emailSent = res.ok;
      if (!res.ok) emailError = await res.text();
    }

    return json({ success: true, emailSent, emailError, deadline: deadline.toISOString() });
  } catch (error: any) {
    console.error("send-galley-proof failed:", error?.message || error);
    return json({ error: error?.message || "Failed to send galley proof" }, 500);
  }
});