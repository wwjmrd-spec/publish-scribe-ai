// Replace an article's manuscript file with an updated .docx and update the
// article details (title, abstract, authors…) scanned from / edited for it.
// Admins can always do this; the article's author only while an admin has
// switched on "Allow author to upload updated manuscript" (one-time use).
// Multipart form: file (.docx) + JSON-stringified "payload" field.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CoAuthorSchema = z.object({
  first_name: z.string().max(100).optional().default(""),
  last_name: z.string().max(100).optional().default(""),
  name: z.string().max(200).optional().default(""),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional().default(""),
  affiliation: z.string().max(300).optional().default(""),
  orcid: z.string().max(50).optional().default(""),
});

const PayloadSchema = z.object({
  articleId: z.string().uuid(),
  title: z.string().trim().min(3).max(500),
  abstract: z.string().max(10000).optional().default(""),
  keywords: z.array(z.string().trim().max(100)).max(20).optional().default([]),
  subject: z.string().max(200).optional().default(""),
  reason_of_research: z.string().max(2000).optional().default(""),
  author_name: z.string().max(200).optional().default(""),
  author_affiliation: z.string().max(300).optional().default(""),
  page_count: z.number().int().min(1).max(1000).nullable().optional(),
  replace_co_authors: z.boolean().optional().default(false),
  co_authors: z.array(CoAuthorSchema).max(20).optional().default([]),
});

const DONE_FORMATTING = ["ready_for_review", "approved"];
const MAX_BYTES = 25 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const sbUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: claims, error: claimsErr } = await sbUser.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(url, serviceKey);
    const { data: roleRow } = await sb
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleRow;

    const form = await req.formData();
    const file = form.get("file");
    const payloadRaw = form.get("payload");
    if (!(file instanceof File)) return json({ error: "Please choose the updated manuscript file." }, 400);
    if (typeof payloadRaw !== "string") return json({ error: "Missing article details" }, 400);
    let payloadJson: unknown;
    try { payloadJson = JSON.parse(payloadRaw); } catch { return json({ error: "Invalid article details" }, 400); }
    const parsed = PayloadSchema.safeParse(payloadJson);
    if (!parsed.success) return json({ error: "Please check the article details", details: parsed.error.flatten().fieldErrors }, 400);
    const p = parsed.data;

    const { data: article, error: artErr } = await sb
      .from("articles")
      .select("id, author_id, title, reference_number, document_url, formatting_status, formatted_content, allow_manuscript_replace, updated_at")
      .eq("id", p.articleId)
      .maybeSingle();
    if (artErr || !article) return json({ error: "Article not found" }, 404);

    if (!isAdmin) {
      if (article.author_id !== userId) return json({ error: "Forbidden" }, 403);
      if (!article.allow_manuscript_replace) {
        return json({ error: "Uploading an updated manuscript is not enabled for this article. Please contact the editorial office." }, 403);
      }
    }

    // A formatting run that is still going would overwrite the new file's result.
    const runningSince = article.updated_at ? Date.now() - new Date(article.updated_at).getTime() : Infinity;
    if (article.formatting_status === "formatting" && runningSince < 10 * 60 * 1000) {
      return json({ error: "Formatting is running for this article right now. Please wait until it finishes, then upload the new file." }, 409);
    }

    // File checks: only a real .docx can be formatted.
    if (!/\.docx$/i.test(file.name)) return json({ error: "Only .docx (Word) files can be uploaded, so the manuscript can be formatted." }, 400);
    if (file.size > MAX_BYTES) return json({ error: "File must be 25 MB or smaller" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      return json({ error: "This file is not a readable .docx document. Please save it as a Word .docx file and try again." }, 400);
    }

    // Co-author list replacement: never silently delete issued/paid certificates.
    const coAuthors = p.co_authors
      .map((c) => {
        const first = c.first_name.trim();
        const last = c.last_name.trim();
        const name = [first, last].filter(Boolean).join(" ") || c.name.trim();
        return { ...c, first, last, name, email: c.email.trim() };
      })
      .filter((c) => c.name.length > 0);
    if (p.replace_co_authors) {
      if (!isAdmin && coAuthors.some((c) => !c.email)) {
        return json({ error: "Please enter an email address for every co-author." }, 400);
      }
      const { data: existing } = await sb
        .from("co_authors")
        .select("id, name, co_author_certificates (id, payment_status, certificate_url)")
        .eq("article_id", article.id);
      const locked = (existing || []).filter((c: any) =>
        (c.co_author_certificates || []).some((cert: any) => cert.payment_status === "paid" || cert.certificate_url)
      );
      if (locked.length > 0) {
        return json({
          error: `The co-author list can't be replaced because ${locked.map((c: any) => c.name).join(", ")} already has a paid or issued certificate. Untick "Replace co-authors" and edit co-authors one by one instead.`,
        }, 409);
      }
    }

    // Upload new file to the author's folder.
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const path = `${article.author_id}/updated-${Date.now()}-${safeName}`;
    const { error: upErr } = await sb.storage.from("documents").upload(path, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

    const formattingDone =
      DONE_FORMATTING.includes(String(article.formatting_status || "")) || !!article.formatted_content;

    const { error: rpcErr } = await sb.rpc("replace_article_manuscript", {
      p_article_id: article.id,
      p_document_url: path,
      p_title: p.title,
      p_abstract: p.abstract,
      p_keywords: p.keywords.filter(Boolean),
      p_subject: p.subject,
      p_reason_of_research: p.reason_of_research,
      p_author_name: p.author_name,
      p_author_affiliation: p.author_affiliation,
      p_page_count: p.page_count ?? null,
      p_needs_reformat: formattingDone,
      p_replaced_by: userId,
      p_revoke_author_permission: !isAdmin,
    } as any);
    if (rpcErr) {
      await sb.storage.from("documents").remove([path]).catch(() => {});
      return json({ error: `Could not save the new manuscript: ${rpcErr.message}` }, 500);
    }

    if (p.replace_co_authors) {
      await sb.from("co_authors").delete().eq("article_id", article.id);
      if (coAuthors.length > 0) {
        const { error: coErr } = await sb.from("co_authors").insert(
          coAuthors.map((c) => ({
            article_id: article.id,
            name: c.name,
            first_name: c.first || null,
            last_name: c.last || null,
            email: c.email,
            affiliation: c.affiliation.trim() || null,
            orcid: c.orcid.trim() || null,
          })),
        );
        if (coErr) console.error("co-author insert failed", coErr.message);
      }
    }

    // The old file is replaced, not kept.
    if (article.document_url && article.document_url !== path) {
      const { error: rmErr } = await sb.storage.from("documents").remove([article.document_url]);
      if (rmErr) console.error("old manuscript removal failed", rmErr.message);
    }

    // Formatting: not done yet -> format the new file now. Already formatted ->
    // the admin clicks Re-format, which rebuilds from the new file.
    let formattingStarted = false;
    let formattingError: string | null = null;
    if (!formattingDone) {
      try {
        const r = await fetch(`${url}/functions/v1/format-article`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: article.id }),
        });
        const body = await r.json().catch(() => ({}));
        if (r.ok && !body?.error) formattingStarted = true;
        else formattingError = body?.error || `Formatting could not start (${r.status})`;
      } catch (e) {
        formattingError = (e as Error).message;
      }
    }

    // Notifications
    const ref = article.reference_number || "N/A";
    if (isAdmin) {
      if (article.author_id !== userId) {
        await sb.from("notifications").insert({
          user_id: article.author_id,
          title: "Manuscript file updated 📄",
          message: `The editorial office uploaded an updated manuscript file for "${p.title}" (${ref}).`,
          type: "info",
          link: `/author/articles/${article.id}`,
        });
      }
    } else {
      const { data: admins } = await sb.from("user_roles").select("user_id").eq("role", "admin");
      if (admins?.length) {
        await sb.from("notifications").insert(
          admins.map((a: any) => ({
            user_id: a.user_id,
            title: "Updated manuscript uploaded 🔄",
            message: `The author uploaded an updated manuscript file for "${p.title}" (${ref}).${formattingDone ? " Formatting was already done — click Re-format to format the new file." : ""}`,
            type: "info",
            link: `/admin/articles/${article.id}`,
          })),
        );
      }
    }

    return json({
      ok: true,
      document_url: path,
      formatting_done_before: formattingDone,
      needs_reformat: formattingDone,
      formatting_started: formattingStarted,
      formatting_error: formattingError,
      co_authors_replaced: p.replace_co_authors,
    });
  } catch (e) {
    console.error("replace-manuscript failed", (e as Error).message);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
