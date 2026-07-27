// Generates / refreshes embeddings for knowledge base articles, FAQs and
// support tickets so the chatbot can do semantic retrieval.
//
// POST { table: "ai_knowledge_base" | "ai_faq" | "support_tickets", id?: string, all?: boolean }
// Without id/all it embeds every row missing an embedding.

import { createClient } from "npm:@supabase/supabase-js@2";
import { embedText, toVectorLiteral } from "../_shared/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Table = "ai_knowledge_base" | "ai_faq" | "support_tickets";

const SOURCE_TEXT: Record<Table, (r: Record<string, unknown>) => string> = {
  ai_knowledge_base: (r) =>
    [r.title, r.question, (r.keywords as string[] | null)?.join(", "), r.content]
      .filter(Boolean).join("\n"),
  ai_faq: (r) =>
    [r.question, (r.keywords as string[] | null)?.join(", "), r.answer]
      .filter(Boolean).join("\n"),
  support_tickets: (r) => String(r.question ?? ""),
};

const EMBED_COLUMN: Record<Table, string> = {
  ai_knowledge_base: "embedding",
  ai_faq: "embedding",
  support_tickets: "question_embedding",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const table = (body.table ?? "ai_knowledge_base") as Table;
    if (!SOURCE_TEXT[table]) {
      return json({ error: "Unsupported table" }, 400);
    }
    const col = EMBED_COLUMN[table];

    let query = sb.from(table).select("*").limit(50);
    if (body.id) query = query.eq("id", body.id);
    else if (!body.all) query = query.is(col, null);

    const { data: rows, error } = await query;
    if (error) throw error;

    let embedded = 0;
    const failures: string[] = [];

    for (const row of rows ?? []) {
      const text = SOURCE_TEXT[table](row as Record<string, unknown>).trim();
      if (!text) continue;
      try {
        const vec = await embedText(text);
        const { error: upErr } = await sb
          .from(table)
          .update({ [col]: toVectorLiteral(vec) })
          .eq("id", (row as { id: string }).id);
        if (upErr) throw upErr;
        embedded++;
      } catch (e) {
        failures.push(`${(row as { id: string }).id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return json({ success: true, table, scanned: rows?.length ?? 0, embedded, failures });
  } catch (e) {
    console.error("chatbot-embed error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
