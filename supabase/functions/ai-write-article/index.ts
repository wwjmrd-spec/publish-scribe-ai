// AI Article Writer — generates a full academic article from raw material,
// polishes grammar/spelling/references, applies corrections with figures,
// and builds a DOCX for download/submit.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { aiChatCompletion, getAiGatewayConfig } from "../_shared/ai-gateway.ts";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
} from "npm:docx@9.0.2";
import { z } from "npm:zod@3.23.8";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const FigureSchema = z.object({
  storagePath: z.string(),
  caption: z.string().default(""),
  insertMode: z.enum(["as_is", "ai_enhanced"]).default("as_is"),
  kind: z.enum(["figure", "table"]).default("figure"),
});

const ArticleSchema = z.object({
  title: z.string().default(""),
  authors: z
    .array(
      z.object({
        name: z.string().default(""),
        affiliation: z.string().default(""),
        email: z.string().default(""),
        isCorresponding: z.boolean().optional(),
      }),
    )
    .default([]),
  abstract: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  introduction: z.string().default(""),
  methodology: z.string().default(""),
  resultsAndDiscussion: z.string().default(""),
  conclusion: z.string().default(""),
  references: z.array(z.string()).default([]),
  referenceStyle: z.string().default("APA"),
  figures: z.array(FigureSchema).default([]),
});

type Article = z.infer<typeof ArticleSchema>;
type Figure = z.infer<typeof FigureSchema>;

const RequestSchema = z.object({
  mode: z.enum(["generate", "polish", "correct", "build_docx", "upload_for_submit"]),
  material: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  affiliation: z.string().optional(),
  referenceStyle: z.string().optional(),
  article: ArticleSchema.optional(),
  answers: z.record(z.string()).optional(),
  // For correct mode
  instructions: z.string().optional(),
  newFigures: z.array(FigureSchema).optional(),
  correctionMode: z.enum(["as_is", "ai_enhanced"]).optional(),
});

const GENERATE_SYSTEM = `You are an expert academic writing AI for a peer-reviewed research journal.
Your task: from raw material the author provides (notes, data, draft text, an idea, a topic), produce a complete, well-structured research article that follows strict academic ethics.

ACADEMIC ETHICS — NON-NEGOTIABLE:
- Do NOT fabricate experimental data, statistics, study participants, equations, or results that are not implied by the material.
- Do NOT invent references. Only include references that the author supplied or that you can cite with full bibliographic detail you are highly confident about. If unsure, list it under "missingInfo.questions" and ask the author to provide it.
- Use neutral, formal academic tone, third person, proper grammar.
- Do NOT plagiarise.
- Be transparent: if a mandatory section cannot be written without more information, leave it empty/partial and add a clear question in missingInfo.questions.

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "title":"...",
  "authors":[{"name":"","affiliation":"","email":"","isCorresponding":true}],
  "abstract":"150-250 word paragraph.",
  "keywords":["4-6 terms"],
  "introduction":"...",
  "methodology":"...",
  "resultsAndDiscussion":"...",
  "conclusion":"...",
  "references":["Full bibliographic entries"],
  "referenceStyle":"APA | IEEE | Harvard",
  "missingInfo":{"questions":["..."]}
}
Use \\n\\n between paragraphs.`;

const POLISH_SYSTEM = `You are an academic copy-editor. Input is a JSON research article.
Fix grammar, spelling, punctuation; ensure every reference is formatted CONSISTENTLY in "referenceStyle" (APA/IEEE/Harvard). Do NOT invent or remove references (unless clear duplicates). Do NOT change meaning.
Return the SAME JSON shape (no markdown fences) with an added "changes" array (max 12 bullets).`;

const CORRECT_SYSTEM = `You are an academic editor applying author corrections to an existing JSON research article.
Apply the author's correction instructions while keeping academic ethics — never invent data or references.
You will also be told about figures/tables the author has attached. Each figure has an "insertMode":
- "as_is": Keep the section text untouched. At the spot where the figure would best fit, insert a single line "[FIGURE:<index>]" (or "[TABLE:<index>]") referencing the figure by its 1-based index. Do NOT write a new caption — the author's caption stays as-is.
- "ai_enhanced": Improve the prose so the figure is properly introduced and discussed (e.g., "As shown in Figure 1, ..."). Insert "[FIGURE:<index>]" markers at the integration points. You MAY refine the caption text and return it in figures[].caption.
Return the SAME article JSON shape (no markdown fences) PLUS a "changes" array (max 10 bullets) describing what you changed. Keep the "figures" array in the same order you received; only edit captions when insertMode is "ai_enhanced".`;

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function callAi(system: string, user: string): Promise<string> {
  const cfg = await getAiGatewayConfig();
  const res = await aiChatCompletion(cfg, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return stripFences(typeof content === "string" ? content : JSON.stringify(content));
}

async function logUsage(
  sb: ReturnType<typeof createClient>,
  userId: string,
  userEmail: string | null,
  userName: string | null,
  action: string,
  articleTitle: string | null,
  metadata: Record<string, unknown> = {},
) {
  try {
    await sb.from("ai_writer_usage").insert({
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      action,
      article_title: articleTitle,
      metadata,
    });
  } catch (e) {
    console.error("ai_writer_usage log failed:", e);
  }
}

/* ---------- DOCX helpers ---------- */

function splitWithMarkers(text: string): Array<{ type: "text" | "marker"; value: string; kind?: "figure" | "table"; index?: number }> {
  if (!text) return [];
  const out: Array<{ type: "text" | "marker"; value: string; kind?: "figure" | "table"; index?: number }> = [];
  const re = /\[(FIGURE|TABLE):(\d+)\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({
      type: "marker",
      value: m[0],
      kind: m[1].toLowerCase() === "table" ? "table" : "figure",
      index: parseInt(m[2], 10),
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function textParagraphs(text: string, opts?: { justify?: boolean }) {
  const parts = (text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return [new Paragraph({ children: [new TextRun("")] })];
  return parts.map(
    (p) =>
      new Paragraph({
        spacing: { after: 160, line: 360 },
        alignment: opts?.justify ? AlignmentType.JUSTIFIED : undefined,
        children: [new TextRun({ text: p, size: 24 })],
      }),
  );
}

function heading(text: string, level: 1 | 2 = 1) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: level === 1 ? 28 : 26 })],
  });
}

async function fetchFigure(sb: ReturnType<typeof createClient>, path: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await sb.storage.from("documents").download(path);
    if (error || !data) return null;
    const buf = await data.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

function figureBlocks(bytes: Uint8Array, caption: string, kind: "figure" | "table", n: number): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
      children: [
        new ImageRun({
          data: bytes,
          transformation: { width: 480, height: 320 },
        } as any),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${kind === "table" ? "Table" : "Figure"} ${n}. ${caption || ""}`.trim(),
          italics: true,
          size: 20,
        }),
      ],
    }),
  ];
}

async function sectionWithMarkers(
  sb: ReturnType<typeof createClient>,
  text: string,
  figures: Figure[],
  loaded: Map<number, Uint8Array>,
  used: Set<number>,
): Promise<Paragraph[]> {
  const blocks: Paragraph[] = [];
  const parts = (text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const tokens = splitWithMarkers(p);
    if (tokens.every((t) => t.type === "text")) {
      blocks.push(
        new Paragraph({
          spacing: { after: 160, line: 360 },
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: p, size: 24 })],
        }),
      );
      continue;
    }
    // Build text-only paragraph (markers excluded), then place figures after it.
    const cleanText = tokens.filter((t) => t.type === "text").map((t) => t.value).join("").trim();
    if (cleanText) {
      blocks.push(
        new Paragraph({
          spacing: { after: 120, line: 360 },
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: cleanText, size: 24 })],
        }),
      );
    }
    for (const tok of tokens) {
      if (tok.type !== "marker") continue;
      const idx = (tok.index ?? 1) - 1;
      const fig = figures[idx];
      const bytes = loaded.get(idx);
      if (!fig || !bytes) continue;
      blocks.push(...figureBlocks(bytes, fig.caption, fig.kind, idx + 1));
      used.add(idx);
    }
  }
  return blocks;
}

async function buildDocx(sb: ReturnType<typeof createClient>, a: Article): Promise<Uint8Array> {
  // Preload figures
  const loaded = new Map<number, Uint8Array>();
  await Promise.all(
    (a.figures || []).map(async (f, i) => {
      const bytes = await fetchFigure(sb, f.storagePath);
      if (bytes) loaded.set(i, bytes);
    }),
  );
  const used = new Set<number>();

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: a.title || "Untitled", bold: true, size: 32 })],
    }),
  );

  if (a.authors?.length) {
    const line = a.authors
      .map((au) => {
        const star = au.isCorresponding ? "*" : "";
        return `${au.name}${star}${au.affiliation ? `, ${au.affiliation}` : ""}`;
      })
      .join("; ");
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: line, size: 22 })],
      }),
    );
    const corresponding = a.authors.find((x) => x.isCorresponding) ?? a.authors[0];
    if (corresponding?.email) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({ text: `*Corresponding author: ${corresponding.email}`, italics: true, size: 20 }),
          ],
        }),
      );
    }
  }

  children.push(heading("Abstract", 1));
  children.push(...textParagraphs(a.abstract, { justify: true }));

  if (a.keywords?.length) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 240 },
        children: [
          new TextRun({ text: "Keywords: ", bold: true, size: 24 }),
          new TextRun({ text: a.keywords.join(", "), size: 24 }),
        ],
      }),
    );
  }

  const sections: Array<[string, string]> = [
    ["1. Introduction", a.introduction],
    ["2. Methodology", a.methodology],
    ["3. Results and Discussion", a.resultsAndDiscussion],
    ["4. Conclusion", a.conclusion],
  ];
  for (const [h, body] of sections) {
    children.push(heading(h, 1));
    const blocks = await sectionWithMarkers(sb, body, a.figures || [], loaded, used);
    children.push(...blocks);
  }

  // Append any figures the AI didn't place inline
  const unused = (a.figures || [])
    .map((_, i) => i)
    .filter((i) => loaded.has(i) && !used.has(i));
  if (unused.length) {
    children.push(heading("Figures & Tables", 1));
    for (const i of unused) {
      const fig = a.figures![i];
      const bytes = loaded.get(i)!;
      children.push(...figureBlocks(bytes, fig.caption, fig.kind, i + 1));
    }
  }

  children.push(heading("References", 1));
  if (a.references?.length) {
    a.references.forEach((ref, i) => {
      const prefix = /^IEEE$/i.test(a.referenceStyle) ? `[${i + 1}] ` : "";
      children.push(
        new Paragraph({
          spacing: { after: 120, line: 320 },
          indent: { left: 360, hanging: 360 },
          children: [new TextRun({ text: prefix + ref, size: 22 })],
        }),
      );
    });
  } else {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "(No references provided)", italics: true, size: 22 })],
      }),
    );
  }

  const doc = new Document({
    creator: "WWJMRD AI Article Writer",
    title: a.title || "Untitled",
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children,
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const sbUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? null;

    const sb = createClient(supabaseUrl, serviceKey);
    let userName: string | null = null;
    try {
      const { data: prof } = await sb.from("profiles").select("full_name").eq("id", userId).single();
      userName = (prof?.full_name as string) ?? null;
    } catch { /* noop */ }

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const body = parsed.data;

    if (body.mode === "generate") {
      if (!body.material || body.material.trim().length < 30) {
        return json({ error: "Please provide more raw material (at least 30 characters)." }, 400);
      }
      const refStyle = body.referenceStyle || "APA";
      const userMsg = `RAW MATERIAL:
"""
${body.material.trim()}
"""
AUTHOR: name=${body.authorName || "(unknown)"} | aff=${body.affiliation || "(unknown)"} | email=${body.authorEmail || "(unknown)"}
Preferred reference style: ${refStyle}
${body.answers && Object.keys(body.answers).length ? `\nANSWERS:\n${Object.entries(body.answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n")}` : ""}
Set "referenceStyle" to "${refStyle}". Leave empty + add missingInfo.questions for anything you don't know.`;

      const raw = await callAi(GENERATE_SYSTEM, userMsg);
      let parsedJson: any;
      try { parsedJson = JSON.parse(raw); } catch { return json({ error: "AI returned malformed JSON", raw }, 502); }
      const article = ArticleSchema.parse(parsedJson);
      const missingInfo = Array.isArray(parsedJson?.missingInfo?.questions)
        ? parsedJson.missingInfo.questions.filter((q: any) => typeof q === "string")
        : [];
      if (article.authors.length === 0 && body.authorName) {
        article.authors = [{
          name: body.authorName,
          affiliation: body.affiliation || "",
          email: body.authorEmail || "",
          isCorresponding: true,
        }];
      }
      await logUsage(sb, userId, userEmail, userName, "generate", article.title, {
        materialChars: body.material.length, referenceStyle: refStyle,
      });
      return json({ success: true, article, missingInfo });
    }

    if (body.mode === "polish") {
      if (!body.article) return json({ error: "article is required for polish mode" }, 400);
      const raw = await callAi(
        POLISH_SYSTEM,
        `referenceStyle: ${body.article.referenceStyle || "APA"}\n\nARTICLE JSON:\n${JSON.stringify(body.article)}`,
      );
      let parsedJson: any;
      try { parsedJson = JSON.parse(raw); } catch { return json({ error: "AI returned malformed JSON", raw }, 502); }
      const article = ArticleSchema.parse(parsedJson);
      const changes = Array.isArray(parsedJson?.changes)
        ? parsedJson.changes.filter((c: any) => typeof c === "string")
        : [];
      await logUsage(sb, userId, userEmail, userName, "polish", article.title, { changes: changes.length });
      return json({ success: true, article, changes });
    }

    if (body.mode === "correct") {
      if (!body.article) return json({ error: "article is required for correct mode" }, 400);
      const newFigures = body.newFigures || [];
      const mergedFigures: Figure[] = [...(body.article.figures || []), ...newFigures];
      const articleWithFigs: Article = { ...body.article, figures: mergedFigures };

      const figureList = mergedFigures.length
        ? mergedFigures.map((f, i) => `#${i + 1} (${f.kind}, mode=${f.insertMode}): caption="${f.caption || "(none)"}"`).join("\n")
        : "(no figures)";

      const userMsg = `AUTHOR CORRECTION INSTRUCTIONS:
"""
${body.instructions || "(no extra text — only attach figures/tables)"}
"""

ATTACHED FIGURES/TABLES (1-based indices, USE these in [FIGURE:n] / [TABLE:n] markers):
${figureList}

ARTICLE JSON (figures already merged):
${JSON.stringify(articleWithFigs)}`;

      const raw = await callAi(CORRECT_SYSTEM, userMsg);
      let parsedJson: any;
      try { parsedJson = JSON.parse(raw); } catch { return json({ error: "AI returned malformed JSON", raw }, 502); }
      const article = ArticleSchema.parse(parsedJson);

      // Preserve storagePath even if AI dropped/changed it
      article.figures = article.figures.map((f, i) => ({
        ...f,
        storagePath: mergedFigures[i]?.storagePath ?? f.storagePath,
        kind: mergedFigures[i]?.kind ?? f.kind,
        insertMode: mergedFigures[i]?.insertMode ?? f.insertMode,
      }));

      const changes = Array.isArray(parsedJson?.changes)
        ? parsedJson.changes.filter((c: any) => typeof c === "string")
        : [];
      await logUsage(sb, userId, userEmail, userName, "correct", article.title, {
        newFigures: newFigures.length, changes: changes.length,
      });
      return json({ success: true, article, changes });
    }

    if (body.mode === "build_docx") {
      if (!body.article) return json({ error: "article is required" }, 400);
      const bytes = await buildDocx(sb, body.article);
      return json({ success: true, docxBase64: encodeBase64(bytes) });
    }

    if (body.mode === "upload_for_submit") {
      if (!body.article) return json({ error: "article is required" }, 400);
      const bytes = await buildDocx(sb, body.article);
      const safeTitle = (body.article.title || "article")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "article";
      const filePath = `${userId}/ai-written/${Date.now()}-${safeTitle}.docx`;
      const { error: upErr } = await sb.storage.from("documents").upload(
        filePath,
        new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
        { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      );
      if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);
      await logUsage(sb, userId, userEmail, userName, "submit", body.article.title, {
        figures: (body.article.figures || []).length,
      });
      return json({
        success: true,
        documentPath: filePath,
        metadata: {
          title: body.article.title,
          abstract: body.article.abstract,
          keywords: body.article.keywords.join(", "),
          author_name: body.article.authors[0]?.name || "",
        },
      });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (err: any) {
    console.error("ai-write-article error:", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
