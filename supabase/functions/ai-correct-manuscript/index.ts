import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { aiChatCompletion, getAiGatewayConfig, type AiGatewayConfig } from "../_shared/ai-gateway.ts";
import mammoth from "npm:mammoth@1.6.0";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  BorderStyle,
} from "npm:docx@8.5.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  articleId: z.string().uuid(),
  mode: z.enum(["preview", "status", "submit"]).default("preview"),
  force: z.boolean().optional().default(false),
  acceptFee: z.boolean().optional().default(false),
});

type CorrectionStatus = "processing" | "completed" | "failed";

interface ExtractedImage {
  id: string;
  data: Uint8Array;
  mime: string;
}

interface ExtractedTable {
  id: string;
  rows: string[][];
}

interface CorrectionJobRecord {
  articleId: string;
  status: CorrectionStatus;
  sourceDocumentUrl: string;
  sourceReviewReportUrl: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  filePath?: string;
  changeSummary?: string[];
  previewText?: string;
  pageCount?: number;
  exceedsFreeLimit?: boolean;
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getStatusPath(userId: string, articleId: string) {
  return `${userId}/ai-corrections/${articleId}.json`;
}

function isMissingStorageObject(error: { message?: string } | null) {
  return !!error?.message && /not found|no such object/i.test(error.message);
}

function isFreshRecord(record: CorrectionJobRecord | null, article: { document_url: string | null; review_report_url: string | null }) {
  return !!record &&
    record.sourceDocumentUrl === article.document_url &&
    record.sourceReviewReportUrl === article.review_report_url;
}

async function readJobRecord(supabase: any, userId: string, articleId: string): Promise<CorrectionJobRecord | null> {
  const statusPath = getStatusPath(userId, articleId);
  const { data, error } = await supabase.storage.from("documents").download(statusPath);
  if (error || !data) {
    if (isMissingStorageObject(error)) return null;
    return null;
  }
  try { return JSON.parse(await data.text()) as CorrectionJobRecord; } catch { return null; }
}

async function writeJobRecord(supabase: any, userId: string, articleId: string, record: CorrectionJobRecord) {
  const { error } = await supabase.storage.from("documents").upload(
    getStatusPath(userId, articleId),
    new Blob([JSON.stringify(record)], { type: "application/json" }),
    { contentType: "application/json", upsert: true }
  );
  if (error) throw new Error(`Failed to save AI correction status: ${error.message}`);
}

async function createStatusResponse(supabase: any, record: CorrectionJobRecord) {
  let downloadUrl: string | null = null;
  if (record.filePath) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(record.filePath, 60 * 60);
    downloadUrl = data?.signedUrl || null;
  }
  return {
    success: record.status === "completed",
    status: record.status,
    error: record.error || null,
    filePath: record.filePath || null,
    downloadUrl,
    changeSummary: record.changeSummary || [],
    previewText: record.previewText || "",
    pageCount: record.pageCount || null,
    exceedsFreeLimit: !!record.exceedsFreeLimit,
  };
}

// =========================================================================
// DOCX EXTRACTION — preserve text, headings, tables, AND embedded images
// =========================================================================

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "image"; id: string; caption?: string }
  | { kind: "table"; id: string; rows: string[][] }
  | { kind: "list"; ordered: boolean; items: string[] };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}
function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

async function extractDocxStructured(supabase: any, documentUrl: string): Promise<{
  blocks: Block[];
  images: Map<string, ExtractedImage>;
  tables: Map<string, ExtractedTable>;
  rawText: string;
}> {
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents").download(documentUrl);
  if (downloadError || !fileData) throw new Error("Failed to download document");
  const buffer = new Uint8Array(await fileData.arrayBuffer());

  const images = new Map<string, ExtractedImage>();
  const tables = new Map<string, ExtractedTable>();
  let imgCounter = 0;
  let tblCounter = 0;

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image: any) => {
        imgCounter++;
        const id = `IMG_${imgCounter}`;
        const buf = await image.read();
        images.set(id, { id, data: new Uint8Array(buf), mime: image.contentType || "image/png" });
        return { src: `placeholder://${id}`, alt: id };
      }),
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Title'] => h1.title:fresh",
      ],
    }
  );
  const rawTextResult = await mammoth.extractRawText({ buffer });

  const blocks: Block[] = [];
  const cleaned = result.value.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ");
  const tagRe = /<(h[1-3]|p|ul|ol|table|img)([^>]*)>([\s\S]*?)<\/\1>|<img([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(cleaned)) !== null) {
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const inner = m[3] || "";
      if (tag === "h1" || tag === "h2" || tag === "h3") {
        const text = stripTags(inner);
        if (text) blocks.push({ kind: "heading", level: parseInt(tag[1], 10) as 1 | 2 | 3, text });
      } else if (tag === "p") {
        const parts = inner.split(/(<img[^>]*>)/i);
        let runText = "";
        for (const part of parts) {
          if (/^<img/i.test(part)) {
            if (runText.trim()) {
              const t = stripTags(runText);
              if (t) blocks.push({ kind: "paragraph", text: t });
              runText = "";
            }
            const idMatch = part.match(/src=["']placeholder:\/\/([^"']+)["']/);
            if (idMatch) blocks.push({ kind: "image", id: idMatch[1] });
          } else {
            runText += part;
          }
        }
        if (runText.trim()) {
          const t = stripTags(runText);
          if (t) blocks.push({ kind: "paragraph", text: t });
        }
      } else if (tag === "ul" || tag === "ol") {
        const items: string[] = [];
        const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let li: RegExpExecArray | null;
        while ((li = liRe.exec(inner)) !== null) {
          const t = stripTags(li[1]);
          if (t) items.push(t);
        }
        if (items.length) blocks.push({ kind: "list", ordered: tag === "ol", items });
      } else if (tag === "table") {
        const rows: string[][] = [];
        const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let tr: RegExpExecArray | null;
        while ((tr = trRe.exec(inner)) !== null) {
          const cells: string[] = [];
          const cellRe = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
          let c: RegExpExecArray | null;
          while ((c = cellRe.exec(tr[1])) !== null) cells.push(stripTags(c[2]));
          if (cells.length) rows.push(cells);
        }
        if (rows.length) {
          tblCounter++;
          const id = `TABLE_${tblCounter}`;
          tables.set(id, { id, rows });
          blocks.push({ kind: "table", id, rows });
        }
      }
    } else if (m[4]) {
      const idMatch = m[4].match(/src=["']placeholder:\/\/([^"']+)["']/);
      if (idMatch) blocks.push({ kind: "image", id: idMatch[1] });
    }
  }

  // Auto-attach figure/table captions
  for (let i = 0; i < blocks.length - 1; i++) {
    const cur = blocks[i];
    const next = blocks[i + 1];
    if (cur.kind === "image" && next.kind === "paragraph") {
      const t = next.text.trim();
      if (/^(fig\.?|figure|graph)\s*\d*[:.]/i.test(t) && t.length < 220) {
        cur.caption = t;
        blocks.splice(i + 1, 1);
      }
    }
  }

  return { blocks, images, tables, rawText: rawTextResult.value };
}

// =========================================================================
// Serialize blocks → marker-laden text the AI can rewrite without losing figs
// =========================================================================
const FIG_MARKER = (id: string) => `[[FIGURE:${id}]]`;
const TBL_MARKER = (id: string) => `[[TABLE:${id}]]`;
const HEADING_MARKER = (lvl: number, t: string) => `[[H${lvl}]] ${t}`;
const LIST_MARKER_O = (items: string[]) => items.map((it, i) => `${i + 1}. ${it}`).join("\n");
const LIST_MARKER_U = (items: string[]) => items.map((it) => `• ${it}`).join("\n");

function serializeBlocks(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "heading") out.push(HEADING_MARKER(b.level, b.text));
    else if (b.kind === "paragraph") out.push(b.text);
    else if (b.kind === "image") out.push(b.caption ? `${FIG_MARKER(b.id)}\n${b.caption}` : FIG_MARKER(b.id));
    else if (b.kind === "table") out.push(TBL_MARKER(b.id));
    else if (b.kind === "list") out.push(b.ordered ? LIST_MARKER_O(b.items) : LIST_MARKER_U(b.items));
  }
  return out.join("\n\n");
}

// Parse the corrected text (still containing markers) back to blocks,
// re-resolving images/tables from the captured maps.
function deserializeBlocks(text: string, images: Map<string, ExtractedImage>, tables: Map<string, ExtractedTable>): Block[] {
  const out: Block[] = [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    // Heading marker
    const h = para.match(/^\[\[H([1-3])\]\]\s*(.+)$/);
    if (h) { out.push({ kind: "heading", level: parseInt(h[1], 10) as 1 | 2 | 3, text: h[2].trim() }); continue; }

    // Figure marker (possibly followed by caption text)
    const fig = para.match(/^\[\[FIGURE:([^\]]+)\]\]\s*([\s\S]*)$/);
    if (fig && images.has(fig[1])) {
      const cap = fig[2].trim();
      out.push({ kind: "image", id: fig[1], caption: cap || undefined });
      continue;
    }
    // Table marker
    const tbl = para.match(/^\[\[TABLE:([^\]]+)\]\]\s*$/);
    if (tbl && tables.has(tbl[1])) {
      const t = tables.get(tbl[1])!;
      out.push({ kind: "table", id: t.id, rows: t.rows });
      continue;
    }

    // List heuristic
    if (/^(\d+\.|•|-)\s+/.test(para)) {
      const lines = para.split(/\n/).map((l) => l.replace(/^(\d+\.|•|-)\s+/, "").trim()).filter(Boolean);
      const ordered = /^\d+\./.test(para);
      out.push({ kind: "list", ordered, items: lines });
      continue;
    }

    // Inline markers fallback: if a paragraph contains a marker mid-text, split it.
    const inline = para.split(/(\[\[(?:FIGURE|TABLE):[^\]]+\]\])/g);
    if (inline.length > 1) {
      for (const piece of inline) {
        if (!piece.trim()) continue;
        const f = piece.match(/^\[\[FIGURE:([^\]]+)\]\]$/);
        const tg = piece.match(/^\[\[TABLE:([^\]]+)\]\]$/);
        if (f && images.has(f[1])) out.push({ kind: "image", id: f[1] });
        else if (tg && tables.has(tg[1])) {
          const t = tables.get(tg[1])!;
          out.push({ kind: "table", id: t.id, rows: t.rows });
        } else out.push({ kind: "paragraph", text: piece.trim() });
      }
      continue;
    }

    out.push({ kind: "paragraph", text: para });
  }
  return out;
}

// =========================================================================
// Build final DOCX from blocks (with embedded images and tables)
// =========================================================================
async function buildDocxFromBlocks(title: string, blocks: Block[], images: Map<string, ExtractedImage>): Promise<Uint8Array> {
  const children: any[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    }),
    new Paragraph({ children: [new TextRun("")] }),
  ];

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

  for (const b of blocks) {
    if (b.kind === "heading") {
      const headingLvl = b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      children.push(new Paragraph({
        heading: headingLvl,
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: b.text, bold: true, size: b.level === 1 ? 28 : b.level === 2 ? 26 : 24 })],
      }));
    } else if (b.kind === "paragraph") {
      children.push(new Paragraph({
        spacing: { after: 160, line: 360 },
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: b.text, size: 24 })],
      }));
    } else if (b.kind === "list") {
      for (let i = 0; i < b.items.length; i++) {
        const prefix = b.ordered ? `${i + 1}. ` : "• ";
        children.push(new Paragraph({
          spacing: { after: 80 },
          indent: { left: 360 },
          children: [new TextRun({ text: prefix + b.items[i], size: 24 })],
        }));
      }
    } else if (b.kind === "image") {
      const img = images.get(b.id);
      if (img) {
        const ext = img.mime.includes("jpeg") || img.mime.includes("jpg") ? "jpg"
          : img.mime.includes("gif") ? "gif" : img.mime.includes("bmp") ? "bmp" : "png";
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 80 },
          children: [new (ImageRun as any)({
            type: ext,
            data: img.data,
            transformation: { width: 420, height: 280 },
          })],
        }));
        if (b.caption) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: b.caption, italics: true, size: 20 })],
          }));
        }
      }
    } else if (b.kind === "table") {
      const cols = Math.max(...b.rows.map((r) => r.length));
      const docxRows = b.rows.map((row, ri) =>
        new DocxTableRow({
          children: Array.from({ length: cols }).map((_, ci) =>
            new DocxTableCell({
              borders: cellBorders,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({
                children: [new TextRun({ text: row[ci] || "", bold: ri === 0, size: 22 })],
              })],
            })
          ),
        })
      );
      children.push(new DocxTable({
        width: { size: 9000, type: WidthType.DXA },
        rows: docxRows,
      }));
      children.push(new Paragraph({ children: [new TextRun("")] }));
    }
  }

  const doc = new Document({
    creator: "WWJMRD AI Auto-Correct",
    title,
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children,
    }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

// =========================================================================
// AI rewrite — operates on serialized text WITH markers it must preserve
// =========================================================================
const SYSTEM_PROMPT = `You are an elite academic editor for a peer-reviewed journal performing a REVISION pass on a manuscript that just received a peer-review report.

YOU WILL RECEIVE:
1. A NUMBERED LIST OF SPECIFIC REVIEWER ISSUES that must be fixed.
2. A SECTION of the manuscript to rewrite. The section may contain special markers:
   - [[H1]] / [[H2]] / [[H3]] = section headings (preserve the marker and the heading text on the same line)
   - [[FIGURE:IMG_x]] = a figure placeholder. KEEP this marker EXACTLY where it appears.
   - [[TABLE:TABLE_x]] = a table placeholder. KEEP this marker EXACTLY where it appears.

YOUR JOB: rewrite the prose so that EVERY reviewer issue applicable to this section is visibly resolved. Improve clarity, structure, grammar, and depth — without inventing data.

HARD RULES — DO NOT VIOLATE:
- KEEP every [[FIGURE:...]] and [[TABLE:...]] marker EXACTLY as written, in the same order, on its own line. Never delete, rename, or merge them.
- KEEP every [[H1]] / [[H2]] / [[H3]] marker exactly with its heading text.
- Do NOT invent data, results, numbers, citations, references, authors, equations, or facts.
- Keep all existing numbers, citations (e.g. [12], (Smith, 2020)), equations, dataset names, and references EXACTLY as given.
- Output must be at least as long and as informative as the original section.
- Return ONLY the rewritten section text through the tool call.
`;

async function downloadReviewReportText(supabase: any, reportPath: string): Promise<string> {
  try {
    const { data } = await supabase.storage.from("review-reports").download(reportPath);
    if (!data) return "";
    const buf = new Uint8Array(await data.arrayBuffer());
    try {
      const r = await mammoth.extractRawText({ buffer: buf });
      if (r.value && r.value.trim().length > 100) return r.value;
    } catch (_) { /* not docx */ }
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const raw = decoder.decode(buf);
    const cleaned = raw.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ").replace(/\s{2,}/g, " ").trim();
    return cleaned.length > 100 ? cleaned : "";
  } catch {
    return "";
  }
}

async function extractActionableIssues(cfg: AiGatewayConfig, reviewReportText: string, reviewMetadata: string): Promise<string> {
  const aiResp = await aiChatCompletion(cfg, {
      messages: [
        { role: "system", content: "You extract a clean, numbered, actionable issue list from a peer-review report. Each item must be a concrete fix the author must apply to their manuscript. No fluff, no praise, no scores — only fixes." },
        { role: "user", content: `REVIEW METADATA:\n${reviewMetadata}\n\nREVIEW REPORT TEXT:\n${reviewReportText.slice(0, 60000)}\n\nReturn a NUMBERED list of concrete imperative fixes the author must perform.` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_issue_list",
          parameters: { type: "object", properties: { issues: { type: "array", items: { type: "string" } } }, required: ["issues"], additionalProperties: false },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_issue_list" } },
  });
  if (!aiResp.ok) return reviewMetadata;
  const data = await aiResp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return reviewMetadata;
  try {
    const parsed = JSON.parse(args) as { issues: string[] };
    if (!parsed.issues?.length) return reviewMetadata;
    return parsed.issues.map((it, i) => `${i + 1}. ${it}`).join("\n");
  } catch { return reviewMetadata; }
}

function chunkSerialized(text: string, maxChars = 16000) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    const cand = current ? `${current}\n\n${p}` : p;
    if (cand.length <= maxChars) { current = cand; continue; }
    if (current) chunks.push(current);
    if (p.length <= maxChars) { current = p; continue; }
    for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars));
    current = "";
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

async function rewriteChunk(cfg: AiGatewayConfig, feedbackText: string, chunk: string, idx: number, total: number) {
  const aiResp = await aiChatCompletion(cfg, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `NUMBERED REVIEWER ISSUES:\n${feedbackText}\n\n---\n\nSECTION ${idx + 1} OF ${total}\n\nRewrite the section to resolve every applicable issue. KEEP every [[FIGURE:...]], [[TABLE:...]] and [[H#]] marker EXACTLY where it appears:\n\n${chunk}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_rewritten_section",
          parameters: { type: "object", properties: { rewritten_section: { type: "string" }, chunk_summary: { type: "array", items: { type: "string" } } }, required: ["rewritten_section", "chunk_summary"], additionalProperties: false },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_rewritten_section" } },
  });
  if (!aiResp.ok) {
    const err = await aiResp.text();
    if (aiResp.status === 429) throw Object.assign(new Error("Rate limit exceeded. Please try again shortly."), { status: 429 });
    if (aiResp.status === 402) throw Object.assign(new Error("AI credits exhausted. Please add funds in Workspace settings."), { status: 402 });
    console.error("AI gateway error:", aiResp.status, err);
    throw new Error("AI correction failed");
  }
  const aiData = await aiResp.json();
  const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc?.function?.arguments) throw new Error("AI did not return a rewritten section");
  const parsed = JSON.parse(tc.function.arguments) as { rewritten_section: string; chunk_summary: string[] };
  return {
    rewrittenSection: parsed.rewritten_section || "",
    chunkSummary: Array.isArray(parsed.chunk_summary) ? parsed.chunk_summary : [],
  };
}

async function rewriteChunksInParallel(cfg: AiGatewayConfig, feedbackText: string, chunks: string[], concurrency = 2) {
  const results = new Array(chunks.length);
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = next++;
      results[i] = await rewriteChunk(cfg, feedbackText, chunks[i], i, chunks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, chunks.length)) }, () => worker()));
  return results as Array<{ rewrittenSection: string; chunkSummary: string[] }>;
}

// Ensure markers absent from the AI output get re-appended at the end so the
// figure/table is never lost even if the model dropped a marker.
function ensureMarkersPresent(corrected: string, originalSerialized: string): string {
  const markers = Array.from(originalSerialized.matchAll(/\[\[(?:FIGURE|TABLE):[^\]]+\]\]/g)).map((m) => m[0]);
  let out = corrected;
  const missing: string[] = [];
  for (const mk of markers) {
    if (!out.includes(mk)) missing.push(mk);
  }
  if (missing.length) out += "\n\n" + missing.join("\n\n");
  return out;
}

interface ScoreResult { overall: number; grammar: number; content: number; plagiarism: number; weaknesses: string[] }

async function scoreManuscript(cfg: AiGatewayConfig, title: string, text: string): Promise<ScoreResult | null> {
  const aiResp = await aiChatCompletion(cfg, {
      messages: [
        { role: "system", content: "You are a strict but fair AI peer reviewer. Score plagiarism, grammar, content, overall (0-100). List remaining weaknesses." },
        { role: "user", content: `Title: ${title}\n\n--- MANUSCRIPT ---\n${text.slice(0, 30000)}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_scores",
          parameters: { type: "object", properties: { plagiarism: { type: "number" }, grammar: { type: "number" }, content: { type: "number" }, overall: { type: "number" }, weaknesses: { type: "array", items: { type: "string" } } }, required: ["plagiarism", "grammar", "content", "overall", "weaknesses"], additionalProperties: false },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_scores" } },
  });
  if (!aiResp.ok) return null;
  const data = await aiResp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    const p = JSON.parse(args);
    return { overall: +p.overall || 0, grammar: +p.grammar || 0, content: +p.content || 0, plagiarism: +p.plagiarism || 0, weaknesses: Array.isArray(p.weaknesses) ? p.weaknesses : [] };
  } catch { return null; }
}

const POLISH_SYSTEM_PROMPT = `You are an elite academic editor performing a FINAL POLISH pass.
Rewrite the section to fully resolve every weakness in the supplied list, targeting 91+ on the next AI peer review.
HARD RULES:
- KEEP every [[FIGURE:...]], [[TABLE:...]] and [[H#]] marker EXACTLY where it appears, on its own line.
- NEVER invent data, numbers, citations or references.
- Output at least as long as the input.
- Return ONLY the polished text via the tool call.`;

async function polishChunk(cfg: AiGatewayConfig, weaknessList: string, chunk: string, idx: number, total: number) {
  const aiResp = await aiChatCompletion(cfg, {
      messages: [
        { role: "system", content: POLISH_SYSTEM_PROMPT },
        { role: "user", content: `REMAINING WEAKNESSES:\n${weaknessList}\n\nSECTION ${idx + 1} OF ${total}\n\n${chunk}` },
      ],
      tools: [{ type: "function", function: { name: "return_polished_section", parameters: { type: "object", properties: { polished_section: { type: "string" } }, required: ["polished_section"], additionalProperties: false } } }],
      tool_choice: { type: "function", function: { name: "return_polished_section" } },
  });
  if (!aiResp.ok) return chunk;
  const data = await aiResp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return chunk;
  try { const p = JSON.parse(args); return (p.polished_section || "").trim() || chunk; } catch { return chunk; }
}

async function polishUntilTarget(cfg: AiGatewayConfig, title: string, initial: string, target = 91, maxIters = 3): Promise<{ finalText: string; finalScore: ScoreResult | null }> {
  let cur = initial;
  let last: ScoreResult | null = null;
  for (let i = 0; i < maxIters; i++) {
    const score = await scoreManuscript(cfg, title, cur);
    last = score;
    if (!score) break;
    if (score.overall >= target) return { finalText: cur, finalScore: score };
    const weakness = score.weaknesses.length ? score.weaknesses.map((w, idx) => `${idx + 1}. ${w}`).join("\n") : "1. Improve overall clarity, transitions and analytic depth.";
    const chunks = chunkSerialized(cur);
    const out: string[] = new Array(chunks.length);
    let cursor = 0;
    async function worker() { while (cursor < chunks.length) { const i = cursor++; out[i] = await polishChunk(cfg, weakness, chunks[i], i, chunks.length); } }
    await Promise.all(Array.from({ length: Math.min(2, chunks.length) }, () => worker()));
    cur = ensureMarkersPresent(out.join("\n\n"), initial);
  }
  const final = await scoreManuscript(cfg, title, cur);
  return { finalText: cur, finalScore: final || last };
}

// Rough page count: chars-per-page heuristic (~2400 chars/page A4 single-spaced + figure/table weight)
function estimatePageCount(blocks: Block[]): number {
  let chars = 0;
  let figures = 0;
  let tableCells = 0;
  for (const b of blocks) {
    if (b.kind === "paragraph" || b.kind === "heading") chars += (b as any).text?.length || 0;
    else if (b.kind === "list") chars += b.items.join(" ").length;
    else if (b.kind === "image") figures += 1;
    else if (b.kind === "table") tableCells += b.rows.reduce((s, r) => s + r.length, 0);
  }
  // figure ≈ 0.4 page; table cell ≈ 35 chars
  const equiv = chars + figures * 1000 + tableCells * 35;
  return Math.max(1, Math.ceil(equiv / 2500));
}

// =========================================================================
// Background processor
// =========================================================================
async function processCorrectionInBackground({ supabase, cfg, userId, article, review }: { supabase: any; cfg: AiGatewayConfig; userId: string; article: any; review: any; }) {
  try {
    const { blocks, images, tables, rawText } = await extractDocxStructured(supabase, article.document_url);
    if (!rawText || rawText.trim().length < 50) throw new Error("Could not read the manuscript text");

    const reviewMetadata = JSON.stringify({
      summary: review.summary,
      scores: { grammar: review.grammar_score, content: review.content_score, overall: review.overall_score },
      feedback: review.detailed_feedback,
    }, null, 2);

    let reviewReportText = "";
    if (article.review_report_url) reviewReportText = await downloadReviewReportText(supabase, article.review_report_url);
    const feedbackText = await extractActionableIssues(cfg, reviewReportText, reviewMetadata);

    const serialized = serializeBlocks(blocks);
    console.log("AI correction: blocks=", blocks.length, "images=", images.size, "tables=", tables.size, "serialized chars=", serialized.length);

    const chunks = chunkSerialized(serialized);
    const rewritten = await rewriteChunksInParallel(cfg, feedbackText, chunks, 2);
    const summarySet = new Set<string>();
    let combined = rewritten.map((c, i) => {
      if (!c.rewrittenSection.trim()) throw new Error(`Section ${i + 1} came back empty`);
      c.chunkSummary.forEach((s) => s?.trim() && summarySet.add(s.trim()));
      return c.rewrittenSection.trim();
    }).join("\n\n");

    combined = ensureMarkersPresent(combined, serialized);

    // Free-tier 2-page rule: if author originally fit ≤2 pages, ask AI to keep it ≤2 pages by trimming if needed.
    const originalPageCount = article.page_count ?? estimatePageCount(blocks);
    let estimatePages = (text: string) => {
      const tmpBlocks = deserializeBlocks(text, images, tables);
      return estimatePageCount(tmpBlocks);
    };
    if (originalPageCount <= 2 && estimatePages(combined) > 2) {
      // Light condense pass: ask AI to keep it within 2 pages.
      const condensed = await polishChunk(
        cfg,
        "1. Tighten the prose so the manuscript fits in 2 printed pages without losing factual content. Keep every figure, table, citation and number. Remove only redundancy and filler.",
        combined, 0, 1,
      );
      const candidate = ensureMarkersPresent(condensed, serialized);
      if (estimatePages(candidate) <= 2) combined = candidate;
    }

    const { finalText, finalScore } = await polishUntilTarget(cfg, article.title || "Corrected Manuscript", combined, 91, 3);
    if (finalScore) {
      summarySet.add(`Final estimated score: ${Math.round(finalScore.overall)}/100 (grammar ${Math.round(finalScore.grammar)}, content ${Math.round(finalScore.content)})`);
      if (finalScore.overall >= 91) summarySet.add("Target score of 91+ reached.");
    }

    const finalBlocks = deserializeBlocks(finalText, images, tables);
    const finalPageCount = estimatePageCount(finalBlocks);
    const exceedsFreeLimit = (article.page_count ?? originalPageCount) <= 2 && finalPageCount > 2;
    if (exceedsFreeLimit) {
      summarySet.add(`⚠️ Corrected manuscript is ~${finalPageCount} pages. The original fit the 2-page free limit; publishing this revised version will require the publication fee.`);
    }
    summarySet.add(`Figures preserved: ${images.size}. Tables preserved: ${tables.size}.`);

    const docxBytes = await buildDocxFromBlocks(article.title || "Corrected Manuscript", finalBlocks, images);
    const filePath = `${userId}/ai-corrections/${article.id}-${Date.now()}-ai-corrected.docx`;

    const { error: upErr } = await supabase.storage.from("documents").upload(
      filePath,
      new Blob([docxBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: false },
    );
    if (upErr) throw new Error("Failed to save corrected manuscript");

    // Plain-text preview (markers stripped)
    const previewText = finalBlocks.map((b) => {
      if (b.kind === "heading") return `\n${b.text.toUpperCase()}\n`;
      if (b.kind === "paragraph") return b.text;
      if (b.kind === "image") return `[Figure${b.caption ? `: ${b.caption}` : ""}]`;
      if (b.kind === "table") return `[Table — ${b.rows.length} rows]`;
      if (b.kind === "list") return b.items.map((it, i) => `${b.ordered ? `${i + 1}. ` : "• "}${it}`).join("\n");
      return "";
    }).join("\n\n").slice(0, 4000);

    await writeJobRecord(supabase, userId, article.id, {
      articleId: article.id,
      status: "completed",
      sourceDocumentUrl: article.document_url,
      sourceReviewReportUrl: article.review_report_url,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      filePath,
      changeSummary: Array.from(summarySet).slice(0, 14),
      previewText,
      pageCount: finalPageCount,
      exceedsFreeLimit,
    });
  } catch (err) {
    console.error("AI correction job failed:", err);
    await writeJobRecord(supabase, userId, article.id, {
      articleId: article.id,
      status: "failed",
      sourceDocumentUrl: article.document_url,
      sourceReviewReportUrl: article.review_report_url,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "AI correction failed",
    });
  }
}

// =========================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "No authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cfg = await getAiGatewayConfig();

    const token = authHeader.replace("Bearer ", "").trim();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const parsedBody = RequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) return jsonResponse({ error: parsedBody.error.flatten().fieldErrors }, 400);
    const { articleId, mode, force, acceptFee } = parsedBody.data;

    const { data: article, error: articleError } = await supabase
      .from("articles").select("*").eq("id", articleId).single();
    if (articleError || !article) return jsonResponse({ error: "Article not found" }, 404);
    if (article.author_id !== userId) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: sub } = await supabase.from("user_subscriptions").select("*").eq("user_id", userId).eq("is_active", true).maybeSingle();
    const isPro = sub?.plan_type === "pro" && (!sub.expires_at || new Date(sub.expires_at) > new Date());
    if (!isPro) return jsonResponse({ error: "Pro plan required" }, 403);

    const currentJob = await readJobRecord(supabase, userId, articleId);
    const hasFreshJob = isFreshRecord(currentJob, article);

    if (mode === "status") {
      if (!hasFreshJob || !currentJob) return jsonResponse({ success: true, status: "idle" });
      return jsonResponse(await createStatusResponse(supabase, currentJob));
    }

    if (!article.review_report_url) return jsonResponse({ error: "Generate the AI review report first" }, 400);
    if (!article.document_url) return jsonResponse({ error: "No manuscript file on article" }, 400);

    const { data: review } = await supabase.from("article_reviews").select("*").eq("article_id", articleId).order("reviewed_at", { ascending: false }).limit(1).maybeSingle();
    if (!review) return jsonResponse({ error: "No AI review found" }, 400);

    if (mode === "submit") {
      if (!hasFreshJob || !currentJob || currentJob.status !== "completed" || !currentJob.filePath) {
        return jsonResponse({ error: "Corrected manuscript is not ready yet." }, 409);
      }

      // If exceeding 2-page free limit, require explicit author consent
      if (currentJob.exceedsFreeLimit && !acceptFee) {
        return jsonResponse({
          error: "fee_required",
          message: `The corrected manuscript exceeds the 2-page free limit (~${currentJob.pageCount} pages). Confirm to proceed; publication fee will apply.`,
          pageCount: currentJob.pageCount,
        }, 409);
      }

      const updates: any = {
        document_url: currentJob.filePath,
        status: "revised_submitted" as any,
        review_report_url: null,
        ai_autocorrected: true,
        ai_autocorrected_at: new Date().toISOString(),
      };
      if (currentJob.pageCount) updates.page_count = currentJob.pageCount;

      const { error: updateError } = await supabase.from("articles").update(updates).eq("id", articleId);
      if (updateError) return jsonResponse({ error: "Failed to attach corrected manuscript" }, 500);

      // Notify author if fee now applies
      if (currentJob.exceedsFreeLimit) {
        await supabase.from("notifications").insert({
          user_id: userId,
          title: "Publication fee will apply 💳",
          message: `Your AI-corrected manuscript "${article.title}" is now ~${currentJob.pageCount} pages and no longer qualifies for the 2-page free publication. The publication fee will be required after acceptance.`,
          type: "warning",
          link: `/author/articles`,
        });
      }

      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins?.length) {
        await supabase.from("notifications").insert(
          admins.map((a: any) => ({
            user_id: a.user_id,
            title: "Revised Manuscript Submitted ✨",
            message: `Author submitted an AI-corrected revised manuscript for "${article.title}" (${article.reference_number}).${currentJob.exceedsFreeLimit ? " Now exceeds 2-page free limit — fee will apply." : ""}`,
            type: "info",
            link: `/admin/ai-review?articleId=${articleId}`,
          }))
        );
      }

      return jsonResponse({ success: true, status: "submitted", filePath: currentJob.filePath, exceedsFreeLimit: currentJob.exceedsFreeLimit, pageCount: currentJob.pageCount });
    }

    if (hasFreshJob && currentJob?.status === "processing") return jsonResponse({ success: true, status: "processing" }, 202);
    if (hasFreshJob && currentJob?.status === "completed" && !force) return jsonResponse(await createStatusResponse(supabase, currentJob));

    await writeJobRecord(supabase, userId, articleId, {
      articleId,
      status: "processing",
      sourceDocumentUrl: article.document_url,
      sourceReviewReportUrl: article.review_report_url,
      startedAt: new Date().toISOString(),
    });

    EdgeRuntime.waitUntil(processCorrectionInBackground({ supabase, cfg, userId, article, review }));
    return jsonResponse({ success: true, status: "processing", message: "AI correction started" }, 202);
  } catch (err) {
    console.error("ai-correct-manuscript error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
