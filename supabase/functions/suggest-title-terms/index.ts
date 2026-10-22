// Admin-only AI helper for the Title Capitalization panel.
// The AI only IDENTIFIES special terms (acronyms, names, scientific names) and
// lists recommendations. It never rewrites the title: casing is applied by the
// deterministic rules in _shared/academicTitle.ts, and every AI term is flagged
// for editorial verification.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeCaller, unauthorized } from "../_shared/callerAuth.ts";
import { getAiGatewayConfig, aiChatCompletion } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KINDS = new Set(["acronym", "proper", "brand", "species", "genus", "term"]);
const REC_TYPES = new Set(["spelling", "nomenclature", "style"]);
const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await authorizeCaller(req, supabase);
  if (!caller || caller.kind !== "admin") return unauthorized(corsHeaders, caller ? 403 : 401);

  let title = "";
  try {
    const body = await req.json();
    title = String(body?.title ?? "").replace(/\s+/g, " ").trim();
  } catch { /* handled below */ }
  if (!title || title.length > 600) return json({ error: "Please provide a title of up to 600 characters." }, 400);

  const prompt = `You help the editor of an academic journal check an article title.
Title: """${title}"""

1. List every word or phrase in the title that must keep special capitalization regardless of title style:
   acronyms/abbreviations (e.g. DNA, COVID-19, eGFR), proper nouns (people, places, organisations, languages),
   brand or officially styled names (e.g. ChatGPT, iPhone), and scientific names (genus, binomial species names).
   "form" must be the term's standard spelling and must contain exactly the same letters as in the title (only letter case may differ).
   If the title is written in capital letters, still give the standard spelling (e.g. "Christian", "Escherichia coli"), not capitals.
   Do NOT list ordinary words. If you are not sure a word is a special term, leave it out.
2. Separately list recommendations the editor may consider, without applying them: spelling mistakes, scientific nomenclature
   problems, or style points. Never suggest changing the meaning of the title.

Reply with JSON only: {"terms":[{"form":"...","kind":"acronym|proper|brand|species|genus|term"}],"recommendations":[{"type":"spelling|nomenclature|style","message":"..."}]}`;

  try {
    const cfg = await getAiGatewayConfig();
    const resp = await aiChatCompletion(cfg, {
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    });
    if (!resp.ok) {
      console.error("suggest-title-terms AI status", resp.status);
      return json({ error: "The AI check is unavailable right now. The built-in rules still work." }, 502);
    }
    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const lowerTitle = squash(title);

    const terms = (Array.isArray(parsed?.terms) ? parsed.terms : [])
      .map((t: any) => ({ form: String(t?.form ?? "").replace(/\s+/g, " ").trim(), kind: String(t?.kind ?? "") }))
      // Only keep terms that literally appear in the title (case-insensitive) — the AI may not respell anything.
      .filter((t: any) => t.form && t.form.length <= 120 && KINDS.has(t.kind) && lowerTitle.includes(t.form.toLowerCase()))
      // An all-capitals name or scientific term is the title's styling copied back, not a standard spelling.
      .filter((t: any) => t.kind === "acronym" || t.form !== t.form.toUpperCase())
      .slice(0, 40);

    const recommendations = (Array.isArray(parsed?.recommendations) ? parsed.recommendations : [])
      .map((r: any) => ({ type: REC_TYPES.has(r?.type) ? r.type : "style", message: String(r?.message ?? "").trim().slice(0, 400) }))
      .filter((r: any) => r.message)
      .slice(0, 10);

    return json({ terms, recommendations });
  } catch (e) {
    console.error("suggest-title-terms failed:", e instanceof Error ? e.message : e);
    return json({ error: "The AI check could not be completed. The built-in rules still work." }, 502);
  }
});
