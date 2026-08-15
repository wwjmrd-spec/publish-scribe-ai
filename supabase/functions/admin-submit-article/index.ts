// Admin tool: submit an article on behalf of any author.
// Multipart form: file (.docx/.pdf) + JSON-stringified "payload" field.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CoAuthorSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254),
  affiliation: z.string().max(300).optional().default(""),
  orcid: z.string().max(50).optional().default(""),
});

const PayloadSchema = z.object({
  author_id: z.string().uuid(),
  title: z.string().min(3).max(500),
  abstract: z.string().max(10000).optional().default(""),
  keywords: z.array(z.string()).max(20).optional().default([]),
  subject: z.string().max(200).optional().default(""),
  reason_of_research: z.string().max(2000).optional().default(""),
  submission_target: z.string().max(200).optional().default(""),
  publication_type: z.enum(["normal", "fast_track"]).optional().default("normal"),
  co_authors: z.array(CoAuthorSchema).max(20).optional().default([]),
  notification_email: z.string().email().max(254).optional().nullable(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const sbUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(url, serviceKey);
    const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const form = await req.formData();
    const file = form.get("file");
    const payloadRaw = form.get("payload");
    if (!(file instanceof File)) return json({ error: "Missing file" }, 400);
    if (typeof payloadRaw !== "string") return json({ error: "Missing payload" }, 400);

    let payloadJson: unknown;
    try { payloadJson = JSON.parse(payloadRaw); } catch { return json({ error: "Invalid payload JSON" }, 400); }
    const parsed = PayloadSchema.safeParse(payloadJson);
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const p = parsed.data;

    // Fetch author profile
    const { data: profile, error: profErr } = await sb
      .from("profiles")
      .select("id, full_name, email, country")
      .eq("id", p.author_id)
      .maybeSingle();
    if (profErr || !profile) return json({ error: "Author not found" }, 404);

    // Upload file to documents bucket under author folder
    const ext = (file.name.split(".").pop() || "docx").toLowerCase();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${p.author_id}/admin-${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await sb.storage.from("documents").upload(path, bytes, {
      contentType: file.type || (ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      upsert: false,
    });
    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

    const { data: article, error: insErr } = await sb
      .from("articles")
      .insert({
        author_id: p.author_id,
        author_name: profile.full_name,
        country: profile.country,
        title: p.title,
        abstract: p.abstract,
        keywords: p.keywords,
        subject: p.subject,
        reason_of_research: p.reason_of_research,
        submission_target: p.submission_target,
        publication_type: p.publication_type,
        document_url: path,
        status: "submitted",
        created_via: "admin",
      })
      .select("id, reference_number")
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    // Insert co-authors
    if (p.co_authors.length > 0) {
      await sb.from("co_authors").insert(
        p.co_authors.map((ca) => ({
          article_id: article.id,
          name: ca.name.trim(),
          email: ca.email.trim(),
          affiliation: ca.affiliation?.trim() || null,
          orcid: ca.orcid?.trim() || null,
        })),
      );
    }

    // Send notification emails to the addresses the admin specified
    const recipients = new Set<string>();
    if (p.notification_email) recipients.add(p.notification_email);
    if (profile.email) recipients.add(profile.email);

    const emailData = {
      articleTitle: p.title,
      referenceNumber: article.reference_number,
      authorName: profile.full_name || "Author",
      authorEmail: profile.email,
      submissionDate: new Date().toLocaleDateString(),
      coAuthors: p.co_authors.map((c) => c.name),
    };

    for (const to of recipients) {
      sb.functions
        .invoke("send-email", {
          body: { to, template: "article-submission", data: emailData, isAdmin: false },
        })
        .catch((e) => console.error("send-email failed", to, e));
    }

    return json({ ok: true, article_id: article.id, reference_number: article.reference_number });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
