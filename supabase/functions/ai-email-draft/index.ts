// Generates an AI draft reply for one ai_emails row using Gemini + KB/FAQ/DB context.
// Never sends anything. Saves to ai_draft_replies for admin review.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-3-flash-preview";

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];
}

function scoreEntry(query: string, entry: { title?: string; question?: string; content?: string; answer?: string; keywords?: string[] }): number {
  const q = tokenize(query);
  const hay = tokenize(`${entry.title || entry.question || ""} ${entry.content || entry.answer || ""} ${(entry.keywords || []).join(" ")}`);
  if (!q.length || !hay.length) return 0;
  const set = new Set(hay);
  let hits = 0;
  for (const w of q) if (set.has(w)) hits++;
  return hits;
}

async function searchKB(supabase: any, query: string) {
  const { data } = await supabase.from("ai_knowledge_base").select("id,title,content,category,keywords").eq("is_active", true).limit(200);
  const scored = (data || []).map((e: any) => ({ ...e, _s: scoreEntry(query, e) })).filter((e: any) => e._s > 0);
  scored.sort((a: any, b: any) => b._s - a._s);
  return scored.slice(0, 5);
}
async function searchFAQ(supabase: any, query: string) {
  const { data } = await supabase.from("ai_faq").select("id,question,answer,category,keywords").eq("is_active", true).limit(200);
  const scored = (data || []).map((e: any) => ({ ...e, _s: scoreEntry(query, e) })).filter((e: any) => e._s > 0);
  scored.sort((a: any, b: any) => b._s - a._s);
  return scored.slice(0, 5);
}

async function findArticleContext(supabase: any, email: any) {
  const text = `${email.subject || ""} ${email.body_text || ""}`;
  const refMatch = text.match(/ART-\d{4}-\d{4}/i);
  let article: any = null;
  if (refMatch) {
    const { data } = await supabase.from("articles")
      .select("id,reference_number,title,author_name,status,created_at,page_count,doi,publication_month,publication_year,published_volume,published_issue,published_start_page,published_end_page,in_publish_queue")
      .ilike("reference_number", refMatch[0]).maybeSingle();
    article = data;
  }
  if (!article && email.from_email) {
    const { data: prof } = await supabase.from("profiles").select("id").eq("email", email.from_email).maybeSingle();
    if (prof?.id) {
      const { data: arts } = await supabase.from("articles")
        .select("id,reference_number,title,status,created_at,page_count,doi,publication_month,publication_year")
        .eq("author_id", prof.id).order("created_at", { ascending: false }).limit(3);
      return { article: null, recent_articles: arts || [] };
    }
  }
  return { article, recent_articles: [] };
}

async function getActiveDiscounts(supabase: any) {
  const now = new Date().toISOString();
  const { data } = await supabase.from("discount_codes")
    .select("code,discount_type,discount_value,currency,end_date,is_active")
    .eq("is_active", true).lte("start_date", now).gte("end_date", now).limit(10);
  return data || [];
}

function buildPrompt(opts: {
  email: any; settings: any; kb: any[]; faq: any[]; article: any; recent: any[]; discounts: any[];
}) {
  const { email, settings, kb, faq, article, recent, discounts } = opts;
  const sys = `You are an editorial assistant for WWJMRD journal.
Tone: ${settings?.reply_tone || "professional"}. Default language: ${settings?.default_language || "English"}.
${settings?.ai_instructions || ""}

CRITICAL RULES:
- Use ONLY the context below. NEVER invent article status, DOI, payment status, certificates, or discount codes.
- If information is missing, politely say it requires manual review by the editorial team.
- Match the language of the incoming email; default to English if unsure.
- Be concise and helpful.
- Output STRICT JSON only, no markdown, no commentary.`;

  const ctx = {
    knowledge_base: kb.map(k => ({ title: k.title, category: k.category, content: k.content })),
    faq: faq.map(f => ({ q: f.question, a: f.answer, category: f.category })),
    article_found: article || null,
    recent_articles_by_sender: recent || [],
    active_discount_codes: discounts.map(d => ({ code: d.code, type: d.discount_type, value: d.discount_value, currency: d.currency, expires: d.end_date })),
    signature: settings?.signature || "",
  };

  const user = `Incoming email:
From: ${email.from_name} <${email.from_email}>
Subject: ${email.subject}
Body:
${(email.body_text || "").slice(0, 6000)}

Context (use only this; do not invent):
${JSON.stringify(ctx, null, 2)}

Return JSON with this exact schema:
{
  "subject": string,            // reply subject (usually "Re: <original>")
  "body": string,                // full reply body in plain text, include signature
  "confidence": number,          // 0-100
  "confidence_label": "high"|"medium"|"low",
  "category": "Article Status"|"Publication"|"Payment"|"DOI"|"Certificate"|"Revision"|"Acceptance"|"Rejection"|"Submission"|"Discount"|"FAQ"|"Technical Support"|"Editorial Question"|"General Inquiry"|"Unknown",
  "language": string,            // detected language of the incoming email
  "reasoning": string,           // short explanation of what context you used
  "sources": [string]            // labels like "KB:Publication Process", "FAQ:DOI", "DB:ART-2024-0123"
}`;

  return { sys, user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { email_id, regenerate } = await req.json();
    if (!email_id) throw new Error("email_id required");

    const { data: email } = await supabase.from("ai_emails").select("*").eq("id", email_id).maybeSingle();
    if (!email) throw new Error("email not found");

    await supabase.from("ai_emails").update({ status: "drafting" }).eq("id", email_id);

    const { data: settings } = await supabase.from("ai_email_settings").select("*").limit(1).maybeSingle();

    const query = `${email.subject || ""} ${email.body_text || ""}`;
    const [kb, faq, artCtx, discounts] = await Promise.all([
      searchKB(supabase, query),
      searchFAQ(supabase, query),
      findArticleContext(supabase, email),
      getActiveDiscounts(supabase),
    ]);

    const { sys, user } = buildPrompt({
      email, settings, kb, faq,
      article: artCtx.article, recent: artCtx.recent_articles, discounts,
    });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) throw new Error("AI rate limit exceeded. Please try again shortly.");
      if (aiRes.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
      throw new Error(`AI gateway error ${aiRes.status}: ${txt}`);
    }
    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content || "{}";

    let parsed: any;
    try { parsed = JSON.parse(content); }
    catch { parsed = { subject: `Re: ${email.subject}`, body: content, confidence: 30, confidence_label: "low", category: "Unknown", language: "English", reasoning: "AI returned non-JSON output", sources: [] }; }

    // If regenerate, delete prior pending drafts
    if (regenerate) {
      await supabase.from("ai_draft_replies").delete().eq("email_id", email_id).eq("status", "pending");
    }

    const { data: draft } = await supabase.from("ai_draft_replies").insert({
      email_id,
      subject: parsed.subject || `Re: ${email.subject}`,
      body: parsed.body || "",
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      confidence_label: parsed.confidence_label || "low",
      category: parsed.category || "Unknown",
      language: parsed.language || "English",
      reasoning: parsed.reasoning || "",
      sources: parsed.sources || [],
      model: MODEL,
      status: "pending",
    }).select("id").maybeSingle();

    await supabase.from("ai_emails").update({ status: "drafted" }).eq("id", email_id);
    await supabase.from("ai_email_logs").insert({
      email_id, draft_id: draft?.id,
      action: regenerate ? "regenerate" : "generate_draft",
      detail: { category: parsed.category, confidence: parsed.confidence },
    });

    return new Response(JSON.stringify({ ok: true, draft_id: draft?.id, draft: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ai-email-draft error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
