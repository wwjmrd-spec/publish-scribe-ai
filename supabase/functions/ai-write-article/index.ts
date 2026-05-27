// AI Article Writer — generates a full academic article from raw material,
// polishes grammar/spelling/references, and builds a DOCX for download/submit.
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
});

type Article = z.infer<typeof ArticleSchema>;

const RequestSchema = z.object({
  mode: z.enum(["generate", "polish", "build_docx", "upload_for_submit"]),
  material: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  affiliation: z.string().optional(),
  referenceStyle: z.string().optional(),
  article: ArticleSchema.optional(),
  answers: z.record(z.string()).optional(),
});

const GENERATE_SYSTEM = `You are an expert academic writing AI for a peer-reviewed research journal.
Your task: from raw material the author provides (notes, data, draft text, an idea, a topic), produce a complete, well-structured research article that follows strict academic ethics.

ACADEMIC ETHICS — NON-NEGOTIABLE:
- Do NOT fabricate experimental data, statistics, study participants, equations, or results that are not implied by the material.
- Do NOT invent references. Only include references that the author supplied or that you can cite with full bibliographic detail you are highly confident about. If unsure, list it under "missingInfo.questions" and ask the author to provide it.
- Use neutral, formal academic tone, third person, proper grammar.
- Do NOT plagiarise: paraphrase the author's material, never copy long passages verbatim from any external source.
- Be transparent: if a mandatory section cannot be written without more information, leave it empty or partial and add a clear question in missingInfo.questions.

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "title": "Concise, informative title",
  "authors": [{"name":"","affiliation":"","email":"","isCorresponding":true}],
  "abstract": "Single 150-250 word paragraph: objective, methodology, key results, conclusion.",
  "keywords": ["4-6 terms"],
  "introduction": "Background, problem, objectives.",
  "methodology": "Research design, data collection, analytical tools.",
  "resultsAndDiscussion": "Findings + critical discussion vs existing literature.",
  "conclusion": "Main insights + future research.",
  "references": ["Full bibliographic entries in the requested style"],
  "referenceStyle": "APA | IEEE | Harvard",
  "missingInfo": { "questions": ["Clear question for author"] }
}

Write substantive prose for each section (multiple paragraphs where appropriate). Use \\n\\n between paragraphs.`;

const POLISH_SYSTEM = `You are an academic copy-editor. The input is a JSON research article.
Tasks: fix grammar, spelling, punctuation, awkward phrasing, and ensure every reference in "references" is formatted CONSISTENTLY in the requested "referenceStyle" (APA, IEEE, or Harvard). Reorder/renumber if the style requires it. Do NOT invent new references and do NOT remove existing ones unless they are clearly duplicates. Do NOT change the meaning of any sentence.
Return the SAME JSON shape (no markdown fences), with a "changes" array briefly listing what you fixed (max 12 bullets).`;

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

function paragraphsFromText(text: string, opts?: { justify?: boolean }) {
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
    children: [
      new TextRun({ text, bold: true, size: level === 1 ? 28 : 26 }),
    ],
  });
}

async function buildDocx(a: Article): Promise<Uint8Array> {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: a.title || "Untitled", bold: true, size: 32 })],
    }),
  );

  // Authors
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
            new TextRun({
              text: `*Corresponding author: ${corresponding.email}`,
              italics: true,
              size: 20,
            }),
          ],
        }),
      );
    }
  }

  // Abstract
  children.push(heading("Abstract", 1));
  children.push(...paragraphsFromText(a.abstract, { justify: true }));

  // Keywords
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
    children.push(...paragraphsFromText(body, { justify: true }));
  }

  // References
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

    // Authenticate user from JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const sbUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    if (body.mode === "generate") {
      if (!body.material || body.material.trim().length < 30) {
        return json({ error: "Please provide more raw material (at least 30 characters)." }, 400);
      }
      const refStyle = body.referenceStyle || "APA";
      const userMsg = `RAW MATERIAL FROM AUTHOR:
"""
${body.material.trim()}
"""

AUTHOR DETAILS:
- Name: ${body.authorName || "(unknown)"}
- Affiliation: ${body.affiliation || "(unknown)"}
- Email: ${body.authorEmail || "(unknown)"}
- Preferred reference style: ${refStyle}

${body.answers && Object.keys(body.answers).length ? `ANSWERS TO PRIOR QUESTIONS:
${Object.entries(body.answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n")}` : ""}

Produce the full JSON article now. Set "referenceStyle" to "${refStyle}".
If author/affiliation/email are missing, leave them empty and add a question to missingInfo.questions.`;

      const raw = await callAi(GENERATE_SYSTEM, userMsg);
      let parsedJson: any;
      try { parsedJson = JSON.parse(raw); } catch {
        return json({ error: "AI returned malformed JSON", raw }, 502);
      }
      const article = ArticleSchema.parse(parsedJson);
      const missingInfo = Array.isArray(parsedJson?.missingInfo?.questions)
        ? parsedJson.missingInfo.questions.filter((q: any) => typeof q === "string")
        : [];

      // Auto-fill author from request if AI left it blank
      if (article.authors.length === 0 && body.authorName) {
        article.authors = [{
          name: body.authorName,
          affiliation: body.affiliation || "",
          email: body.authorEmail || "",
          isCorresponding: true,
        }];
      }

      return json({ success: true, article, missingInfo });
    }

    if (body.mode === "polish") {
      if (!body.article) return json({ error: "article is required for polish mode" }, 400);
      const raw = await callAi(
        POLISH_SYSTEM,
        `referenceStyle: ${body.article.referenceStyle || "APA"}\n\nARTICLE JSON:\n${JSON.stringify(body.article)}`,
      );
      let parsedJson: any;
      try { parsedJson = JSON.parse(raw); } catch {
        return json({ error: "AI returned malformed JSON", raw }, 502);
      }
      const article = ArticleSchema.parse(parsedJson);
      const changes = Array.isArray(parsedJson?.changes)
        ? parsedJson.changes.filter((c: any) => typeof c === "string")
        : [];
      return json({ success: true, article, changes });
    }

    if (body.mode === "build_docx") {
      if (!body.article) return json({ error: "article is required" }, 400);
      const bytes = await buildDocx(body.article);
      return json({ success: true, docxBase64: encodeBase64(bytes) });
    }

    if (body.mode === "upload_for_submit") {
      if (!body.article) return json({ error: "article is required" }, 400);
      const bytes = await buildDocx(body.article);
      const sb = createClient(supabaseUrl, serviceKey);
      const safeTitle = (body.article.title || "article")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "article";
      const filePath = `${userId}/ai-written/${Date.now()}-${safeTitle}.docx`;
      const { error: upErr } = await sb.storage.from("documents").upload(
        filePath,
        new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
        { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      );
      if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);
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
