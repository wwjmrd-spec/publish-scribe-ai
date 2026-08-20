import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { aiChatCompletion, getAiGatewayConfig, type AiGatewayConfig } from "../_shared/ai-gateway.ts";
import mammoth from "npm:mammoth@1.6.0";
import { jsPDF } from "npm:jspdf@2.5.2";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  PageOrientation,
  Header as DocxHeader,
  Footer as DocxFooter,
  PageNumber,
  ShadingType,
} from "npm:docx@9.0.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// =========================================================================
// 1. DOCX EXTRACTION  — preserve text, headings, tables, AND embedded images
// =========================================================================

interface ExtractedImage {
  id: string;          // placeholder id used in HTML/text e.g. "IMG_1"
  data: Uint8Array;    // raw bytes
  mime: string;        // image/png, image/jpeg
}

async function extractDocx(supabase: any, documentUrl: string): Promise<{
  html: string;
  rawText: string;
  images: ExtractedImage[];
}> {
  console.log("Downloading document:", documentUrl);
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(documentUrl);
  if (downloadError || !fileData) {
    throw new Error("Failed to download document: " + (downloadError?.message || "no data"));
  }
  const ab = await fileData.arrayBuffer();
  const buffer = new Uint8Array(ab);

  const images: ExtractedImage[] = [];
  let imgCounter = 0;

  // Mammoth: convert images to placeholder <img> tags but keep raw bytes for later use
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image: any) => {
        imgCounter++;
        const id = `IMG_${imgCounter}`;
        const buf = await image.read();
        const bytes = new Uint8Array(buf);
        // mammoth gives base64 by default; we instead store raw and emit a placeholder src
        images.push({ id, data: bytes, mime: image.contentType || "image/png" });
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

  console.log(`Extracted ${images.length} embedded images, html length=${result.value.length}`);
  return { html: result.value, rawText: rawTextResult.value, images };
}

// =========================================================================
// 2. PARSE HTML → STRUCTURED BLOCKS
// =========================================================================

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; html: string; text: string }
  | { kind: "image"; id: string; caption?: string }
  | { kind: "table"; rows: string[][] }
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

function parseHtmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Normalize whitespace
  const cleaned = html.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ");
  // Match top-level elements: h1-h3, p, ul, ol, table, img
  const tagRe = /<(h[1-6]|p|ul|ol|table)([^>]*)>([\s\S]*?)<\/\1>|<img([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(cleaned)) !== null) {
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const inner = m[3] || "";
      if (/^h[1-6]$/.test(tag)) {
        const text = stripTags(inner);
        const lvl = Math.min(3, parseInt(tag[1], 10)) as 1 | 2 | 3;
        if (text) blocks.push({ kind: "heading", level: lvl, text });
      } else if (tag === "p") {
        // Check if paragraph contains only an image
        const imgOnly = /^\s*<img[^>]*>\s*$/i.test(inner);
        if (imgOnly) {
          const idMatch = inner.match(/src=["']placeholder:\/\/([^"']+)["']/);
          if (idMatch) blocks.push({ kind: "image", id: idMatch[1] });
        } else {
          // Paragraph might contain inline images mixed with text — split them out
          const parts = inner.split(/(<img[^>]*>)/i);
          let runText = "";
          for (const part of parts) {
            if (/^<img/i.test(part)) {
              if (runText.trim()) {
                blocks.push({ kind: "paragraph", html: runText, text: stripTags(runText) });
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
            if (t) blocks.push({ kind: "paragraph", html: runText, text: t });
          }
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
          while ((c = cellRe.exec(tr[1])) !== null) {
            cells.push(stripTags(c[2]));
          }
          if (cells.length) rows.push(cells);
        }
        if (rows.length) blocks.push({ kind: "table", rows });
      }
    } else if (m[4]) {
      // Top-level <img/>
      const idMatch = m[4].match(/src=["']placeholder:\/\/([^"']+)["']/);
      if (idMatch) blocks.push({ kind: "image", id: idMatch[1] });
    }
  }

  // Auto-caption: when an image is followed by a paragraph starting with "Fig" or "Figure" or "Table",
  // attach as caption.
  for (let i = 0; i < blocks.length - 1; i++) {
    const cur = blocks[i];
    const next = blocks[i + 1];
    if (cur.kind === "image" && next.kind === "paragraph") {
      const t = next.text.trim();
      if (/^(fig\.?|figure|graph)\s*\d*[:.]/i.test(t) && t.length < 200) {
        cur.caption = t;
        blocks.splice(i + 1, 1);
      }
    }
  }

  return blocks;
}

// =========================================================================
// 3. AI METADATA EXTRACTION  (only metadata; body comes from the parsed DOCX)
// =========================================================================

interface ArticleMetadata {
  header: { year: string; volume: string; issue: string; page_range: string };
  title: string;
  authors: { name: string; designation: string }[];
  correspondence: { name: string; designation: string };
  abstract: string;
  keywords: string[];
  references: string[];
  // Indexes (in the original blocks order) where the body content really starts/ends
  body_start_heading: string;     // first heading that should appear in body (e.g. "Introduction")
  references_heading: string;     // heading text for references section (used to cut off)
  suggestions: { type: string; message: string; severity: "info" | "warning" | "improvement" }[];
}

const METADATA_SYSTEM_PROMPT = `
You are a metadata extractor for the World Wide Journal of Multidisciplinary Research and Development (WWJMRD).

You will receive the FULL text of an academic article. Your job is ONLY to extract metadata and leave the body alone.

Extract:
- Header: year, volume, issue, page_range. If unknown use sensible defaults (current year, 12, 01, "01-10").
- Title (no quotes)
- Authors: name + designation (Designation, Institution, City, Country format)
- Correspondence (typically the first or contact author)
- Abstract: a single paragraph (200–300 words). Copy verbatim from the article — do NOT rewrite.
- Keywords: array of 3-7 keywords
- References: array of EVERY reference in the order they appear (do not skip, do not summarize, do not truncate). Remove the original numbering (we'll re-number). Keep raw URLs. If the article has 30 references, return all 30.
- body_start_heading: the EXACT text of the first heading where the main body begins (usually "Introduction" or "1. Introduction" — copy exactly as it appears).
- references_heading: the EXACT text of the references section heading (e.g. "References" or "Bibliography" — copy exactly).

DO NOT rewrite text. DO NOT summarize. Copy verbatim from the source.
`;

async function extractMetadata(rawText: string, cfg: AiGatewayConfig, fallbackTitle: string): Promise<ArticleMetadata> {
  const truncated = rawText.substring(0, 120000);

  const aiResponse = await aiChatCompletion(cfg, {
    messages: [
      { role: "system", content: METADATA_SYSTEM_PROMPT },
      { role: "user", content: `Extract metadata from this article:\n\n${truncated}` },
    ],
      tools: [{
        type: "function",
        function: {
          name: "extract_metadata",
          description: "Extract WWJMRD metadata from an article",
          parameters: {
            type: "object",
            properties: {
              header: {
                type: "object",
                properties: {
                  year: { type: "string" },
                  volume: { type: "string" },
                  issue: { type: "string" },
                  page_range: { type: "string" },
                },
                required: ["year", "volume", "issue", "page_range"],
              },
              title: { type: "string" },
              authors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    designation: { type: "string" },
                  },
                  required: ["name", "designation"],
                },
              },
              correspondence: {
                type: "object",
                properties: { name: { type: "string" }, designation: { type: "string" } },
                required: ["name", "designation"],
              },
              abstract: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              references: { type: "array", items: { type: "string" } },
              body_start_heading: { type: "string" },
              references_heading: { type: "string" },
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    message: { type: "string" },
                    severity: { type: "string", enum: ["info", "warning", "improvement"] },
                  },
                  required: ["type", "message", "severity"],
                },
              },
            },
            required: ["header", "title", "authors", "correspondence", "abstract", "keywords", "references", "body_start_heading", "references_heading", "suggestions"],
          },
        },
      }],
    tool_choice: { type: "function", function: { name: "extract_metadata" } },
  });

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    console.error("AI metadata error:", aiResponse.status, errText);
    if (aiResponse.status === 429) throw new Error("RATE_LIMIT");
    if (aiResponse.status === 402) throw new Error("CREDITS_EXHAUSTED");
    throw new Error("AI metadata extraction failed");
  }

  const aiData = await aiResponse.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) throw new Error("AI returned invalid metadata response");

  const meta: ArticleMetadata = JSON.parse(toolCall.function.arguments);
  if (!meta.title) meta.title = fallbackTitle;
  if (!meta.suggestions) meta.suggestions = [];

  // Safety net: if the AI returned fewer references than a naive regex scan finds,
  // fall back to the regex list so we never silently drop refs.
  try {
    const regexRefs = splitReferences(rawText);
    if ((meta.references?.length ?? 0) < regexRefs.length) {
      console.log(`AI returned ${meta.references?.length ?? 0} refs, regex found ${regexRefs.length} — using regex list`);
      meta.references = regexRefs;
    }
  } catch (_) { /* ignore */ }

  return meta;
}

function extractSection(rawText: string, start: RegExp, end: RegExp): string {
  const startMatch = rawText.match(start);
  if (!startMatch?.index) return "";
  const from = startMatch.index + startMatch[0].length;
  const rest = rawText.slice(from);
  const endMatch = rest.match(end);
  return (endMatch?.index != null ? rest.slice(0, endMatch.index) : rest)
    .replace(/\s+/g, " ")
    .trim();
}

function splitReferences(rawText: string): string[] {
  const refs = extractSection(rawText, /\b(references|bibliography)\b\s*:?/i, /\n\s*(appendix|annex)\b/i);
  if (!refs) return [];
  return refs
    .split(/(?:\n\s*|\s{2,})(?:\[?\d+\]?\.?\)?\s+)/)
    .map((r) => r.replace(/^\s*\[?\d+\]?\.?\)?\s*/, "").trim())
    .filter((r) => r.length > 20)
    .slice(0, 80);
}

function buildFallbackMetadata(rawText: string, fallbackTitle: string, authorName?: string): ArticleMetadata {
  const currentYear = String(new Date().getFullYear());
  const abstract = extractSection(rawText, /\babstract\b\s*:?/i, /\b(keywords?|introduction|1\.?\s*introduction)\b\s*:?/i);
  const keywordSection = extractSection(rawText, /\bkeywords?\b\s*:?/i, /\b(introduction|1\.?\s*introduction)\b\s*:?/i);
  const keywords = keywordSection
    .split(/[;,]/)
    .map((k) => k.replace(/^[-–—\s]+/, "").trim())
    .filter((k) => k.length > 1 && k.length < 60)
    .slice(0, 7);

  return {
    header: { year: currentYear, volume: "12", issue: "01", page_range: "01-10" },
    title: fallbackTitle || "Untitled Article",
    authors: [{ name: authorName || "Author", designation: "" }],
    correspondence: { name: authorName || "Author", designation: "" },
    abstract: abstract || "Abstract not detected in the source manuscript.",
    keywords: keywords.length ? keywords : ["Research", "Article"],
    references: splitReferences(rawText),
    body_start_heading: "Introduction",
    references_heading: "References",
    suggestions: [
      {
        type: "metadata_fallback",
        message: "AI metadata extraction was unavailable, so formatting used the manuscript text and default metadata. Please review title, author, abstract, keywords, and references before approval.",
        severity: "warning",
      },
    ],
  };
}

// =========================================================================
// 4. SLICE THE BODY  — keep blocks BETWEEN intro heading and references heading
// =========================================================================

function normHeading(s: string): string {
  return s.toLowerCase().replace(/^\s*\d+[.)]?\s*/, "").replace(/[^a-z0-9]/g, "").trim();
}

function blockText(b: Block): string {
  if (b.kind === "heading") return b.text;
  if (b.kind === "paragraph") return b.text;
  if (b.kind === "list") return b.items.join(" ");
  if (b.kind === "table") return b.rows.flat().join(" ");
  return b.caption || "";
}

function removeFrontMatterBlocks(blocks: Block[], meta: ArticleMetadata): Block[] {
  const titleKey = normHeading(meta.title || "");
  const frontMatterKeys = new Set(["abstract", "keyword", "keywords"]);
  const cleaned: Block[] = [];
  let skipUntilHeading = false;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const text = blockText(b).replace(/\s+/g, " ").trim();
    const key = normHeading(text);

    if (skipUntilHeading) {
      if (b.kind !== "heading") continue;
      skipUntilHeading = false;
    }

    if (titleKey && i < 8 && key === titleKey) continue;
    if (b.kind === "heading" && frontMatterKeys.has(key)) {
      skipUntilHeading = true;
      continue;
    }
    if (/^(abstract|keywords?|key\s*words?)\s*[:\-]/i.test(text)) continue;

    cleaned.push(b);
  }

  return cleaned;
}

function sliceBodyBlocks(blocks: Block[], meta: ArticleMetadata): Block[] {
  const startKey = normHeading(meta.body_start_heading || "introduction");
  const refKey = normHeading(meta.references_heading || "references");
  const skipKeys = new Set(["abstract", "keywords", "keyword"]);

  let start = -1, end = blocks.length;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "heading") {
      const k = normHeading(b.text);
      if (start < 0 && (k === startKey || k.includes(startKey) || startKey.includes(k))) start = i;
      else if (start >= 0 && (k === refKey || k.includes(refKey) || refKey.includes(k))) {
        end = i;
        break;
      }
    }
  }

  // Heuristic: if we couldn't locate the body start, OR the slice ended up
  // suspiciously small (< 30% of total blocks), include the FULL document
  // (skipping obvious title/abstract/keywords headings + the very next paragraph).
  const sliced = start >= 0 ? blocks.slice(start, end) : [];
  if (sliced.length < Math.max(5, blocks.length * 0.3)) {
    const filtered: Block[] = [];
    let skipNext = false;
    for (const b of blocks) {
      if (b.kind === "heading" && skipKeys.has(normHeading(b.text))) {
        skipNext = true;
        continue;
      }
      if (skipNext && b.kind === "paragraph") {
        skipNext = false;
        continue;
      }
      skipNext = false;
      filtered.push(b);
    }
    return removeFrontMatterBlocks(filtered, meta);
  }
  return removeFrontMatterBlocks(sliced, meta);
}

function removeReferenceSection(blocks: Block[], meta: ArticleMetadata): Block[] {
  const refKeys = new Set([normHeading(meta.references_heading || "references"), "references", "bibliography", "works cited", "worksreferenced"]);
  // Cut on ANY block (heading OR paragraph) whose normalized text is a ref-section label.
  // This handles documents where "Bibliography" or "References" is just a bolded paragraph
  // rather than a real Hx heading — those slipped through previously and duplicated the
  // reference list rendered separately at the bottom.
  const isRefLabel = (b: Block) => {
    if (b.kind === "heading") return refKeys.has(normHeading(b.text));
    if (b.kind === "paragraph") {
      const k = normHeading(b.text);
      if (refKeys.has(k)) return true;
      // Some manuscripts write "Bibliography:" or "References (cont.)" — match prefix
      if (/^(references?|bibliography|workscited)/.test(k) && k.length < 30) return true;
    }
    return false;
  };
  const end = blocks.findIndex(isRefLabel);
  return end >= 0 ? blocks.slice(0, end) : blocks;
}

// =========================================================================
// 5. IMAGE DIMENSIONS (PNG/JPEG sniffer)
// =========================================================================

function getImageDimensions(bytes: Uint8Array): { width: number; height: number } {
  // PNG: width at offset 16, height at offset 20 (big-endian uint32)
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width: w >>> 0, height: h >>> 0 };
  }
  // JPEG: scan SOFn markers
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      i += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (marker >= 0xc0 && marker <= 0xc3) {
        const h = (bytes[i + 3] << 8) | bytes[i + 4];
        const w = (bytes[i + 5] << 8) | bytes[i + 6];
        return { width: w, height: h };
      }
      const segLen = (bytes[i] << 8) | bytes[i + 1];
      if (segLen <= 0) break;
      i += segLen;
    }
  }
  return { width: 600, height: 400 };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa works in Deno
  // deno-lint-ignore no-deprecated-deno-api
  return btoa(binary);
}

// =========================================================================
// 6. PDF GENERATION  (WWJMRD layout with embedded images)
// =========================================================================

function generatePdf(meta: ArticleMetadata, body: Block[], images: Map<string, ExtractedImage>): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const mL = 15, mR = 15, mTop = 15, mBottom = 18;
  const fullW = pageWidth - mL - mR;

  const black: [number, number, number] = [0, 0, 0];
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentMonth = monthNames[new Date().getMonth()];
  const yr = meta.header.year || String(new Date().getFullYear());
  const vol = meta.header.volume || "12";
  const iss = meta.header.issue || "01";
  const pgRange = meta.header.page_range || "01-10";

  let y = 0;

  function runningHeader() {
    doc.setFontSize(9);
    doc.setFont("times", "bolditalic");
    doc.setTextColor(...black);
    doc.text(`World Wide Journal of Multidisciplinary Research and Development (${currentMonth}-${yr})`,
      pageWidth / 2, 10, { align: "center" });
    doc.setDrawColor(...black);
    doc.setLineWidth(0.4);
    doc.line(mL, 12, pageWidth - mR, 12);
  }

  function shortHeader() {
    doc.setFontSize(9);
    doc.setFont("times", "italic");
    doc.setTextColor(...black);
    doc.text("World Wide Journal of Multidisciplinary Research and Development", mL, 9);
  }

  // ======== PAGE 1 ========
  runningHeader();
  y = 14;

  // Banner placeholder (teal)
  const bannerH = 40;
  doc.setFillColor(0, 130, 130);
  doc.rect(mL, y, fullW, bannerH, "F");
  doc.setFontSize(16);
  doc.setFont("times", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("WORLD WIDE JOURNAL OF", pageWidth / 2, y + 14, { align: "center" });
  doc.text("MULTIDISCIPLINARY RESEARCH AND", pageWidth / 2, y + 22, { align: "center" });
  doc.text("DEVELOPMENT", pageWidth / 2, y + 30, { align: "center" });
  y += bannerH + 6;

  // Two-column layout for page 1: left sidebar (40mm) + right content
  const sidebarW = 42;
  const sidebarX = mL;
  const rightX = mL + sidebarW + 5;
  const rightW = fullW - sidebarW - 5;

  // ---- LEFT SIDEBAR ----
  let leftY = y;
  doc.setTextColor(...black);
  doc.setFontSize(8); doc.setFont("times", "normal");
  doc.text(`WWJMRD ${yr}; ${vol}(${iss}): ${pgRange}`, sidebarX, leftY); leftY += 4;
  doc.text("www.wwjmrd.com", sidebarX, leftY); leftY += 5;
  doc.setFont("times", "italic");
  ["International Journal","Peer Reviewed Journal","Refereed Journal","Indexed Journal"].forEach((s) => {
    doc.text(s, sidebarX, leftY); leftY += 3.5;
  });
  doc.setFontSize(7);
  const impLines = doc.splitTextToSize("Impact Factor SJIF 2017: 5.182 2018: 5.51, (ISI) 2020-2021: 1.361", sidebarW);
  impLines.forEach((l: string) => { doc.text(l, sidebarX, leftY); leftY += 3.2; });
  doc.setFontSize(8);
  doc.text("E-ISSN: 2454-6615", sidebarX, leftY); leftY += 6;

  // Authors in sidebar
  for (const a of meta.authors || []) {
    doc.setFont("times", "bold"); doc.setFontSize(9);
    const nameLines = doc.splitTextToSize(a.name, sidebarW);
    nameLines.forEach((l: string) => { doc.text(l, sidebarX, leftY); leftY += 4; });
    if (a.designation) {
      doc.setFont("times", "normal"); doc.setFontSize(8);
      const dLines = doc.splitTextToSize(a.designation, sidebarW);
      dLines.forEach((l: string) => { doc.text(l, sidebarX, leftY); leftY += 3.4; });
    }
    leftY += 2;
  }
  // Correspondence at bottom of sidebar
  if (meta.correspondence?.name) {
    leftY += 3;
    doc.setFont("times", "bold"); doc.setFontSize(9);
    doc.text("Correspondence:", sidebarX, leftY); leftY += 4;
    doc.text(meta.correspondence.name, sidebarX, leftY); leftY += 4;
    if (meta.correspondence.designation) {
      doc.setFont("times", "normal"); doc.setFontSize(8);
      const cLines = doc.splitTextToSize(meta.correspondence.designation, sidebarW);
      cLines.forEach((l: string) => { doc.text(l, sidebarX, leftY); leftY += 3.4; });
    }
  }

  // ---- RIGHT COLUMN: Title + Authors + Abstract + Keywords ----
  let rightY = y;
  doc.setFont("times", "bold"); doc.setFontSize(15); doc.setTextColor(...black);
  const tLines = doc.splitTextToSize(meta.title, rightW);
  tLines.forEach((l: string) => { doc.text(l, rightX + rightW / 2, rightY, { align: "center" }); rightY += 7; });
  rightY += 3;

  if (meta.authors?.length) {
    doc.setFont("times", "bold"); doc.setFontSize(11);
    const names = meta.authors.map(a => a.name).join(", ");
    const nLines = doc.splitTextToSize(names, rightW);
    nLines.forEach((l: string) => { doc.text(l, rightX, rightY); rightY += 5; });
    rightY += 3;
  }

  doc.setFont("times", "bold"); doc.setFontSize(10);
  doc.text("Abstract", rightX, rightY); rightY += 4;
  doc.setFont("times", "normal"); doc.setFontSize(10);
  const absLines = doc.splitTextToSize(meta.abstract || "", rightW);
  absLines.forEach((l: string, i: number) => {
    if (rightY > pageHeight - mBottom - 20) return;
    if (i < absLines.length - 1) doc.text(l, rightX, rightY, { align: "justify", maxWidth: rightW });
    else doc.text(l, rightX, rightY);
    rightY += 4.2;
  });
  rightY += 3;

  if (meta.keywords?.length) {
    doc.setFont("times", "bold"); doc.setFontSize(10);
    const lbl = "Keywords: ";
    doc.text(lbl, rightX, rightY);
    const lblW = doc.getTextWidth(lbl);
    doc.setFont("times", "italic");
    const kw = meta.keywords.join(", ");
    const kwLines = doc.splitTextToSize(kw, rightW - lblW);
    kwLines.forEach((l: string, i: number) => {
      doc.text(l, i === 0 ? rightX + lblW : rightX, rightY);
      rightY += 4.2;
    });
  }

  // Move y to bottom of whichever column went lower
  y = Math.max(leftY, rightY) + 6;

  // Page footer ~ N ~
  function addFooter(pageNum: number) {
    doc.setFontSize(9); doc.setFont("times", "normal"); doc.setTextColor(...black);
    doc.text(`~ ${pageNum} ~`, pageWidth / 2, pageHeight - 8, { align: "center" });
  }

  // ======== PAGES 2+ : two columns with body content ========
  doc.addPage();
  let pageNum = 2;
  shortHeader();
  y = 14;

  const colGap = 6;
  const colW = (fullW - colGap) / 2;
  const colX = [mL, mL + colW + colGap];
  let curCol = 0;
  let colTop = y;

  function newPage() {
    doc.addPage();
    pageNum++;
    shortHeader();
    y = 14;
    colTop = y;
    curCol = 0;
  }

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - mBottom) {
      if (curCol === 0) {
        curCol = 1;
        y = colTop;
      } else {
        newPage();
      }
    }
  }

  function drawText(text: string, opts: { size?: number; bold?: boolean; italic?: boolean; lineH?: number; align?: "left" | "justify" | "center" } = {}) {
    const size = opts.size ?? 10;
    const lineH = opts.lineH ?? 4.0;
    const style = opts.bold && opts.italic ? "bolditalic" : opts.bold ? "bold" : opts.italic ? "italic" : "normal";
    doc.setFontSize(size); doc.setFont("times", style); doc.setTextColor(...black);
    const lines = doc.splitTextToSize(text, colW);
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(lineH);
      const x = colX[curCol];
      if (opts.align === "center") doc.text(lines[i], x + colW / 2, y, { align: "center" });
      else if (opts.align === "justify" && i < lines.length - 1) doc.text(lines[i], x, y, { align: "justify", maxWidth: colW });
      else doc.text(lines[i], x, y);
      y += lineH;
    }
  }

  function drawHeading(text: string, level: 1 | 2 | 3) {
    const size = level === 1 ? 11 : level === 2 ? 10.5 : 10;
    ensureSpace(size * 0.5 + 3);
    y += 2;
    drawText(text, { size, bold: true, lineH: size * 0.45 + 1 });
    y += 1;
  }

  function drawImage(img: ExtractedImage, caption?: string) {
    const dims = getImageDimensions(img.data);
    // Decide max width: fit in column, but if very wide allow full-width (cross both cols)
    let maxWmm = colW;
    let useFullWidth = false;
    if (dims.width / dims.height > 1.4) {
      useFullWidth = true;
      maxWmm = fullW;
    }
    const aspect = dims.height / Math.max(dims.width, 1);
    let drawW = maxWmm;
    let drawH = drawW * aspect;
    // Cap height to 40% of page
    const maxH = (pageHeight - mTop - mBottom) * 0.45;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH / aspect;
    }
    if (useFullWidth) {
      // Full-width images go on a fresh page section
      ensureSpace(drawH + 10);
      // If we're mid-column, jump to next available position spanning full width
      const xStart = mL;
      // If we don't have room, switch column or new page first
      const needed = drawH + 8;
      if (y + needed > pageHeight - mBottom) {
        if (curCol === 0) { curCol = 1; y = colTop; }
        else newPage();
      }
      try {
        const fmt = img.mime.includes("png") ? "PNG" : "JPEG";
        const dataUrl = `data:${img.mime};base64,${bytesToBase64(img.data)}`;
        doc.addImage(dataUrl, fmt, xStart + (fullW - drawW) / 2, y, drawW, drawH, undefined, "MEDIUM");
        y += drawH + 2;
        if (caption) {
          drawText(caption, { size: 9, bold: true, align: "center" });
        }
        y += 2;
      } catch (e) {
        console.error("addImage failed", e);
      }
    } else {
      ensureSpace(drawH + 8);
      try {
        const fmt = img.mime.includes("png") ? "PNG" : "JPEG";
        const dataUrl = `data:${img.mime};base64,${bytesToBase64(img.data)}`;
        const xCenter = colX[curCol] + (colW - drawW) / 2;
        doc.addImage(dataUrl, fmt, xCenter, y, drawW, drawH, undefined, "MEDIUM");
        y += drawH + 2;
        if (caption) {
          drawText(caption, { size: 9, bold: true, align: "center" });
        }
        y += 2;
      } catch (e) {
        console.error("addImage failed", e);
      }
    }
  }

  function drawTableBlock(rows: string[][]) {
    if (rows.length === 0) return;
    const cols = Math.max(...rows.map(r => r.length));
    const cellW = colW / cols;
    const rowH = 6;
    for (let r = 0; r < rows.length; r++) {
      ensureSpace(rowH);
      const x0 = colX[curCol];
      doc.setLineWidth(0.2);
      doc.setDrawColor(80, 80, 80);
      for (let c = 0; c < cols; c++) {
        const cellX = x0 + c * cellW;
        doc.rect(cellX, y, cellW, rowH);
        const txt = (rows[r][c] || "").substring(0, 60);
        doc.setFontSize(8);
        doc.setFont("times", r === 0 ? "bold" : "normal");
        doc.setTextColor(...black);
        doc.text(txt, cellX + 1, y + 4, { maxWidth: cellW - 2 });
      }
      y += rowH;
    }
    y += 2;
  }

  // Render body blocks
  for (const block of body) {
    if (block.kind === "heading") {
      drawHeading(block.text, block.level);
    } else if (block.kind === "paragraph") {
      drawText(block.text, { size: 10, align: "justify", lineH: 4.2 });
      y += 1;
    } else if (block.kind === "image") {
      const img = images.get(block.id);
      if (img) drawImage(img, block.caption);
    } else if (block.kind === "table") {
      drawTableBlock(block.rows);
    } else if (block.kind === "list") {
      for (let i = 0; i < block.items.length; i++) {
        const prefix = block.ordered ? `${i + 1}. ` : "• ";
        drawText(prefix + block.items[i], { size: 10, align: "justify", lineH: 4.2 });
      }
      y += 1;
    }
  }

  // References at the end (two columns continued)
  if (meta.references?.length) {
    drawHeading("References", 2);
    for (let i = 0; i < meta.references.length; i++) {
      drawText(`${i + 1}. ${meta.references[i]}`, { size: 9, lineH: 3.7 });
    }
  }

  // Add footers to all pages
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    addFooter(p + (Number(pgRange.split(/[-–]/)[0]) - 1 || 0));
  }

  return doc.output("arraybuffer");
}

// =========================================================================
// 7. DOCX GENERATION  (with embedded images)
// =========================================================================

function generateDocx(meta: ArticleMetadata, body: Block[], images: Map<string, ExtractedImage>): Promise<Uint8Array> {
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentMonth = monthNames[new Date().getMonth()];
  const yr = meta.header.year || String(new Date().getFullYear());
  const vol = meta.header.volume || "12";
  const iss = meta.header.issue || "01";
  const pgRange = meta.header.page_range || "01-10";

  const para = (text: string, opts: { bold?: boolean; italic?: boolean; size?: number; align?: keyof typeof AlignmentType; spacingAfter?: number } = {}) => {
    return new Paragraph({
      alignment: AlignmentType[opts.align || "JUSTIFIED"],
      spacing: { after: opts.spacingAfter ?? 80 },
      children: [new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italic,
        size: (opts.size ?? 11) * 2,
        font: "Times New Roman",
      })],
    });
  };

  const heading = (text: string, level: 1 | 2 | 3) => {
    return new Paragraph({
      heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text, bold: true, size: (level === 1 ? 14 : level === 2 ? 12 : 11) * 2, font: "Times New Roman" })],
    });
  };

  const children: any[] = [];

  // Title block
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: meta.title, bold: true, size: 28, font: "Times New Roman" })],
  }));

  // Authors line
  if (meta.authors?.length) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: meta.authors.map(a => a.name).join(", "), bold: true, size: 22, font: "Times New Roman" })],
    }));
  }

  // Author details (italic, smaller)
  for (const a of meta.authors || []) {
    if (a.designation) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new TextRun({ text: a.name + ": ", bold: true, size: 18, font: "Times New Roman" }),
          new TextRun({ text: a.designation, italics: true, size: 18, font: "Times New Roman" }),
        ],
      }));
    }
  }

  if (meta.correspondence?.name) {
    children.push(new Paragraph({
      spacing: { before: 120, after: 60 },
      children: [
        new TextRun({ text: "Correspondence: ", bold: true, size: 20, font: "Times New Roman" }),
        new TextRun({ text: meta.correspondence.name, bold: true, size: 20, font: "Times New Roman" }),
      ],
    }));
    if (meta.correspondence.designation) {
      children.push(para(meta.correspondence.designation, { italic: true, size: 9, spacingAfter: 120 }));
    }
  }

  // Abstract
  children.push(heading("Abstract", 2));
  children.push(para(meta.abstract || "", { size: 11 }));

  // Keywords
  if (meta.keywords?.length) {
    children.push(new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "Keywords: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: meta.keywords.join(", "), italics: true, size: 22, font: "Times New Roman" }),
      ],
    }));
  }

  // Body blocks
  for (const block of body) {
    if (block.kind === "heading") {
      children.push(heading(block.text, block.level));
    } else if (block.kind === "paragraph") {
      children.push(para(block.text));
    } else if (block.kind === "image") {
      const img = images.get(block.id);
      if (img) {
        const dims = getImageDimensions(img.data);
        // Fit width to ~16cm (page width ~16.5cm with 1in margins on A4)
        const maxWidthPx = 600; // ~16cm at 96dpi
        const aspect = dims.height / Math.max(dims.width, 1);
        const w = Math.min(maxWidthPx, dims.width);
        const h = w * aspect;
        try {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 60 },
            children: [new ImageRun({
              type: img.mime.includes("png") ? "png" : "jpg",
              data: img.data,
              transformation: { width: w, height: h },
            })],
          }));
          if (block.caption) {
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 },
              children: [new TextRun({ text: block.caption, bold: true, italics: true, size: 18, font: "Times New Roman" })],
            }));
          }
        } catch (e) {
          console.error("DOCX image failed", e);
        }
      }
    } else if (block.kind === "table") {
      const cols = Math.max(...block.rows.map(r => r.length));
      const tblWidth = 9000; // ~6.25" in DXA
      const colW = Math.floor(tblWidth / cols);
      const docxRows = block.rows.map((r, ri) => new DocxTableRow({
        children: Array.from({ length: cols }).map((_, ci) => new DocxTableCell({
          width: { size: colW, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: ri === 0 ? { fill: "D9D9D9", type: ShadingType.CLEAR } : undefined,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
          },
          children: [new Paragraph({
            children: [new TextRun({ text: r[ci] || "", bold: ri === 0, size: 18, font: "Times New Roman" })],
          })],
        })),
      }));
      children.push(new DocxTable({
        width: { size: tblWidth, type: WidthType.DXA },
        columnWidths: Array.from({ length: cols }).map(() => colW),
        rows: docxRows,
      }));
      children.push(para("", { spacingAfter: 100 }));
    } else if (block.kind === "list") {
      for (let i = 0; i < block.items.length; i++) {
        const prefix = block.ordered ? `${i + 1}. ` : "• ";
        children.push(para(prefix + block.items[i], { size: 11, spacingAfter: 40 }));
      }
    }
  }

  // References
  if (meta.references?.length) {
    children.push(heading("References", 2));
    for (let i = 0; i < meta.references.length; i++) {
      children.push(para(`${i + 1}. ${meta.references[i]}`, { size: 10, spacingAfter: 40 }));
    }
  }

  const docHeader = new DocxHeader({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `World Wide Journal of Multidisciplinary Research and Development (${currentMonth}-${yr})`,
        italics: true, bold: true, size: 18, font: "Times New Roman",
      })],
    })],
  });

  const docFooter = new DocxFooter({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `WWJMRD ${yr}; ${vol}(${iss}): ${pgRange}  |  ~ `, size: 16, font: "Times New Roman" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Times New Roman" }),
        new TextRun({ text: " ~", size: 16, font: "Times New Roman" }),
      ],
    })],
  });

  const document = new Document({
    creator: "WWJMRD Formatter",
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      headers: { default: docHeader },
      footers: { default: docFooter },
      children,
    }],
  });

  return Packer.toBuffer(document).then((b) => new Uint8Array(b));
}

// =========================================================================
// 8. HTML for the editor preview  (matches what the user sees in editor)
//    We render the SAME structured blocks so the editor reflects download.
// =========================================================================

function generateEditorHtml(meta: ArticleMetadata, body: Block[], images: Map<string, ExtractedImage>): string {
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentMonth = monthNames[new Date().getMonth()];
  const yr = meta.header.year || String(new Date().getFullYear());
  const vol = meta.header.volume || "12";
  const iss = meta.header.issue || "01";
  const pgRange = meta.header.page_range || "01-10";

  const esc = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const renderImage = (id: string, caption?: string) => {
    const img = images.get(id);
    if (!img) return "";
    const dataUrl = `data:${img.mime};base64,${bytesToBase64(img.data)}`;
    const cap = caption ? `<p class="ww-caption">${esc(caption)}</p>` : "";
    return `<figure class="ww-figure"><img src="${dataUrl}" alt="figure" />${cap}</figure>`;
  };

  const renderTable = (rows: string[][]) => {
    const trs = rows.map((r, ri) =>
      `<tr>${r.map(c => `<${ri === 0 ? "th" : "td"}>${esc(c)}</${ri === 0 ? "th" : "td"}>`).join("")}</tr>`
    ).join("");
    return `<table class="ww-data-table">${trs}</table>`;
  };

  const bodyHtml = body.map(b => {
    if (b.kind === "heading") return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
    if (b.kind === "paragraph") return `<p>${esc(b.text)}</p>`;
    if (b.kind === "image") return renderImage(b.id, b.caption);
    if (b.kind === "table") return renderTable(b.rows);
    if (b.kind === "list") {
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag}>${b.items.map(i => `<li>${esc(i)}</li>`).join("")}</${tag}>`;
    }
    return "";
  }).join("");

  const allReferences = meta.references || [];
  const refsHtml = allReferences.length
    ? `<h2 class="ww-references-h">References</h2><ol class="ww-references">${allReferences.map(r => `<li>${esc(r)}</li>`).join("")}</ol>`
    : "";

  const authorsInline = (meta.authors || []).map((a, i) => {
    const sup = a.designation ? `<sup>${i + 1}</sup>` : "";
    return `${esc(a.name)}${sup}`;
  }).join(", ");

  const orcidBadge = (rawId: string) => {
    const id = (rawId || "").trim();
    if (!id) return "";
    return `<span class="ww-orcid" data-orcid="${id}" style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;"><img src="https://orcid.org/sites/default/files/images/orcid_16x16.png" alt="ORCID iD" style="width:11px;height:11px;display:inline-block;vertical-align:middle;" /><a href="https://orcid.org/${id}" style="color:#a6ce39;text-decoration:none;font-size:9px;">${id}</a></span>`;
  };
  const withOrcidBadges = (text: string) =>
    esc(text).replace(/ORCID:\s*([0-9Xx-]{9,25})/g, (_m, id) => orcidBadge(String(id).trim()));

  const affiliationsList = (meta.authors || [])
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.designation)
    .map(({ a, i }) => `<p class="ww-affil" data-author-index="${i + 1}"><sup>${i + 1}</sup> ${withOrcidBadges(a.designation || "")}</p>`)
    .join("");

  const today = new Date();
  const fmtDate = (d: Date) => `${d.getDate().toString().padStart(2, "0")} ${monthNames[d.getMonth()].slice(0,3)} ${d.getFullYear()}`;
  const receivedDate = fmtDate(new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000));
  const revisedDate = fmtDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
  const acceptedDate = fmtDate(new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000));
  const publishedDate = fmtDate(today);
  const citationAuthors = (meta.authors || []).map(a => a.name).join(", ") || "Author";

  return `
<style>
  .wwjmrd-article { font-family: Georgia, 'Times New Roman', serif; color:#0f172a; background:#fff; }
  .ww-a4-page { width:180mm; min-height:267mm; margin:0 auto; background:#fff; }
  .ww-first-page { max-width:780px; padding:0; }
  .ww-body-page { width:180mm; margin:0 auto; padding:0; background:#fff; }
  .ww-body-flow { max-width:166mm; margin:0 auto; padding:0; font-size:10.8px; line-height:1.62; color:#1f2937; }
  .ww-body-flow h1, .ww-body-flow h2, .ww-body-flow h3 { font-family:Georgia,'Times New Roman',serif; color:#0f172a; font-weight:bold; margin:12px 0 5px; line-height:1.25; }
  .ww-body-flow h1 { font-size:14px; } .ww-body-flow h2 { font-size:12.5px; } .ww-body-flow h3 { font-size:11.5px; }
  .ww-body-flow p { text-align:justify; margin:4px 0; }
  .ww-body-flow ul, .ww-body-flow ol { margin:5px 0 6px 18px; padding:0; }
  .ww-body-flow li { margin:2px 0; text-align:justify; }
  .ww-figure { page-break-inside:avoid; break-inside:avoid; text-align:center; margin:10px 0 12px; }
  .ww-figure img { max-width:100%; height:auto; display:inline-block; }
  .ww-caption { text-align:center !important; font-weight:bold; font-style:italic; font-size:10px; margin:3px 0 0 !important; }
  .ww-data-table { page-break-inside:avoid; break-inside:avoid; border-collapse:collapse; width:100%; margin:9px 0 12px; table-layout:fixed; word-wrap:break-word; }
  .ww-data-table th, .ww-data-table td { border:1px solid #94a3b8; padding:5px 6px; font-size:9.2px; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; text-align:left; }
  .ww-data-table th { background:#e2e8f0; font-weight:bold; text-align:center; }
  .ww-references-h { font-size:13px; font-weight:bold; margin:10px 0 4px; page-break-before:auto; break-before:auto; page-break-after:avoid; break-after:avoid; }
  .ww-references { font-size:9.5px; line-height:1.4; list-style:none; padding-left:0; margin:0; counter-reset:wwref; }
  .ww-references li { text-align:justify; padding-left:18px; text-indent:-18px; margin:1px 0; counter-increment:wwref; page-break-inside:avoid; break-inside:avoid; }
  .ww-references li::before { content: counter(wwref) ". "; font-weight:bold; display:inline-block; min-width:16px; }
  @media print { .ww-a4-page, .ww-body-page { page-break-after:always; break-after:page; } }
</style>
<div class="wwjmrd-article">
  <section class="ww-a4-page ww-first-page" data-a4-page="first">
    <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #1e3a8a;"><tr>
      <td style="padding:10px 24px 8px;vertical-align:middle;"><img src="/wwjmrd-logo.png" alt="WWJMRD" style="height:48px;width:auto;display:block;" /></td>
      <td style="padding:10px 24px 8px;vertical-align:middle;text-align:right;font-family:Arial,sans-serif;font-size:9px;color:#1e3a8a;line-height:1.5;"><div style="font-weight:bold;">E-ISSN: 2454-6615</div><div>www.wwjmrd.com</div></td>
    </tr></table>
    <div style="display:flex;align-items:center;justify-content:space-between;background:#f1f5f9;padding:8px 24px;border-bottom:1px solid #cbd5e1;">
      <span style="background:#1e3a8a;color:#fff;font-family:Arial,sans-serif;font-size:9px;font-weight:bold;letter-spacing:1.2px;padding:5px 12px;border-radius:2px;">RESEARCH ARTICLE</span>
      <span style="font-family:Arial,sans-serif;font-size:9px;color:#334155;font-weight:600;">Volume ${vol} | Issue ${iss} | ${currentMonth}-${yr} | Pages <span class="ww-page-range">${pgRange}</span></span>
    </div>
    <table style="width:100%;border-collapse:collapse;"><tr style="vertical-align:top;">
      <td style="padding:14px 12px 8px 24px;">
        <h1 style="font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#0f172a;line-height:1.3;margin:0 0 10px;">${esc(meta.title)}</h1>
        <p style="font-size:11px;color:#1e3a8a;font-weight:600;margin:0 0 6px;line-height:1.5;">${authorsInline}</p>
        <div style="margin:0 0 12px;font-size:9px;color:#333;">${affiliationsList}</div>
        <div style="border:1px solid #cbd5e1;border-left:4px solid #1e3a8a;border-radius:6px;background:#f8fafc;padding:12px 14px;margin:10px 0 14px;">
          <div style="font-family:Arial,sans-serif;font-weight:bold;color:#1e3a8a;font-size:11px;letter-spacing:1.5px;margin-bottom:6px;">ABSTRACT</div>
          <p style="text-align:justify;font-size:10px;line-height:1.6;margin:0 0 8px;color:#1f2937;">${esc(meta.abstract || "")}</p>
          <div style="border-top:1px dashed #cbd5e1;padding-top:6px;margin-top:6px;"><span style="font-family:Arial,sans-serif;font-weight:bold;color:#1e3a8a;font-size:9px;letter-spacing:1.2px;">KEYWORDS: </span><span style="font-size:10px;font-style:italic;color:#334155;">${esc((meta.keywords || []).join(", "))}</span></div>
        </div>
      </td>
      <td style="width:215px;padding:14px 24px 8px 0;font-family:Arial,Helvetica,sans-serif;">
        <div style="border:1px solid #c7d2fe;border-radius:8px;background:linear-gradient(160deg,#1e1b4b,#312e81);padding:10px;margin-bottom:10px;text-align:center;">
          <div style="font-size:8px;font-weight:bold;color:#c4b5fd;letter-spacing:1.2px;margin-bottom:4px;">SUBMITTED VIA</div>
          <img src="/pubportal-logo.png" alt="PubPortal" style="height:28px;width:auto;display:inline-block;margin:2px 0 6px;" />
          <ul style="list-style:none;padding:0;margin:0 0 8px;font-size:9px;color:#e0e7ff;line-height:1.6;text-align:left;"><li>✓ Easy Online Submission</li><li>✓ Real-time Tracking</li><li>✓ Peer Review Management</li><li>✓ Faster Decision</li><li>✓ Wider Visibility</li></ul>
          <a href="https://wwjmrdai.online/auth" style="display:block;text-decoration:none;text-align:center;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:10px;font-weight:bold;padding:7px;border-radius:6px;letter-spacing:0.5px;">Submit Now →</a>
          <div style="text-align:center;font-size:8px;color:#c4b5fd;margin-top:5px;font-weight:600;">www.wwjmrdai.online</div>
        </div>
        <div style="border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px;margin-bottom:12px;background:#fff;"><div style="font-size:9px;font-weight:bold;color:#1e3a8a;letter-spacing:1.2px;border-bottom:2px solid #1e3a8a;padding-bottom:4px;margin-bottom:6px;">ABOUT THE JOURNAL</div><p style="font-size:9px;line-height:1.5;color:#334155;margin:0;">WWJMRD is a peer-reviewed, refereed and indexed international multidisciplinary publication platform welcoming research across all disciplines.</p></div>
        <div style="border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px;margin-bottom:12px;background:#fff;"><div style="font-size:9px;font-weight:bold;color:#1e3a8a;letter-spacing:1.2px;border-bottom:2px solid #1e3a8a;padding-bottom:4px;margin-bottom:6px;">JOURNAL HIGHLIGHTS</div><ul style="list-style:none;padding:0;margin:0;font-size:9px;color:#334155;line-height:1.8;"><li>◆ Peer Reviewed Journal</li><li>◆ Refereed Journal</li><li>◆ Indexed Journal</li><li>◆ Global Indexing & Archiving</li><li>◆ Impact Factor (SJIF)</li></ul></div>
        <div style="border:1px solid #1e3a8a;border-radius:6px;padding:10px 12px;background:#1e3a8a;color:#fff;"><div style="font-size:9px;font-weight:bold;letter-spacing:1.2px;border-bottom:1px solid #3b82f6;padding-bottom:4px;margin-bottom:6px;">CONTACT US</div><p style="font-size:8.5px;line-height:1.5;margin:0 0 4px;font-weight:bold;">World Wide Journal of Multidisciplinary Research and Development (WWJMRD)</p><p style="font-size:8.5px;margin:2px 0;">support@wwjmrd.com</p><p style="font-size:8.5px;margin:2px 0;">www.wwjmrd.com</p></div>
      </td>
    </tr></table>
    <div class="ww-cover-bottom">
    <div style="margin:6px 24px 0;border-top:2px solid #1e3a8a;padding-top:10px;">
      <table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:10px;"><tr>${[["Received", receivedDate],["Revised", revisedDate],["Accepted", acceptedDate],["Published", publishedDate]].map(([l,v]) => `<td style="border:1px solid #cbd5e1;border-radius:5px;padding:6px;text-align:center;background:#f8fafc;font-family:Arial,sans-serif;width:25%;"><div style="font-size:8px;color:#64748b;font-weight:bold;letter-spacing:1px;">${l.toUpperCase()}</div><div style="font-size:10px;color:#1e3a8a;font-weight:bold;margin-top:2px;">${v}</div></td>`).join("")}</tr></table>
      <div style="border-left:3px solid #1e3a8a;background:#f1f5f9;padding:8px 12px;border-radius:0 4px 4px 0;"><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:bold;color:#1e3a8a;letter-spacing:1px;margin-bottom:3px;">HOW TO CITE THIS ARTICLE</div><p style="font-size:9.5px;line-height:1.5;margin:0;color:#334155;">${esc(citationAuthors)}. ${esc(meta.title)}. <em>World Wide Journal of Multidisciplinary Research and Development</em>, ${yr}; ${vol}(${iss}): <span class="ww-page-range">${pgRange}</span>.</p></div>
    </div>
    <div style="background:#0f172a;color:#fff;text-align:center;padding:12px;margin-top:14px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;font-weight:bold;">www.wwjmrd.com</div>
    </div>

  </section>
  <section class="ww-body-page" data-flow-root="true"><div class="ww-body-flow">${bodyHtml}${refsHtml}</div></section>
</div>`;
}
// =========================================================================
// 9. MAIN HANDLER
// =========================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let stuckArticleId: string | null = null;
  let stuckSupabase: ReturnType<typeof createClient> | null = null;
  let completed = false;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiGateway = await getAiGatewayConfig();

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return jsonResponse({ error: "Unauthorized" }, 401);

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    stuckSupabase = supabase;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    if (roleData?.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403);

    const { articleId } = await req.json();
    if (!articleId) return jsonResponse({ error: "Article ID required" }, 400);
    stuckArticleId = articleId;

    await supabase.from("articles").update({ formatting_status: "formatting" }).eq("id", articleId);

    // Offload heavy work so the client fetch doesn't time out.
    const bgTask = (async () => {
      try {
        const { data: article, error: articleError } = await supabase
          .from("articles")
          .select("*, profiles:author_id (full_name, country, affiliation, orcid)")
          .eq("id", articleId)
          .single();
        if (articleError || !article) throw new Error("Article not found");
        if (!article.document_url) throw new Error("Article has no source DOCX");

        const { data: coAuthorsRows } = await supabase
          .from("co_authors")
          .select("name, affiliation, orcid")
          .eq("article_id", articleId);

        // 1. Extract DOCX
        const extracted = await extractDocx(supabase, article.document_url);
        if (!extracted.rawText || extracted.rawText.trim().length < 100) {
          throw new Error("Document is too short or empty");
        }

        // 2. Parse blocks
        const allBlocks = parseHtmlToBlocks(extracted.html);
        console.log(`Parsed ${allBlocks.length} blocks from DOCX html`);

        // 3. AI metadata
        let meta: ArticleMetadata;
        try {
          meta = await extractMetadata(extracted.rawText, aiGateway, article.title || "Untitled");
        } catch (e: any) {
          console.error("Metadata extraction failed:", e?.message);
          meta = buildFallbackMetadata(
            extracted.rawText,
            article.title || "Untitled",
            article.author_name || article.profiles?.full_name,
          );
        }

        const profile: any = article.profiles || {};
        const primaryName = (article.author_name || profile.full_name || meta.authors?.[0]?.name || "Author").trim();
        const primaryDesignation = [
          profile.affiliation,
          article.country || profile.country,
          profile.orcid ? `ORCID: ${profile.orcid}` : "",
        ].filter(Boolean).join(", ");
        const overrideAuthors = [{ name: primaryName, designation: primaryDesignation }];
        for (const c of coAuthorsRows ?? []) {
          if (!c?.name) continue;
          overrideAuthors.push({
            name: c.name,
            designation: [c.affiliation, c.orcid ? `ORCID: ${c.orcid}` : ""].filter(Boolean).join(", "),
          });
        }
        meta.authors = overrideAuthors;
        meta.correspondence = { name: primaryName, designation: primaryDesignation };

        const _now = new Date();
        const _currentMonth = String(_now.getMonth() + 1).padStart(2, "0");
        meta.header = {
          year: ((article as any).publication_year || String(_now.getFullYear())).toString(),
          volume: ((article as any).volume || "12").toString(),
          issue: ((article as any).issue || _currentMonth).toString(),
          page_range: ((article as any).page_number || meta.header?.page_range || "01-10").toString(),
        };

        const body = removeReferenceSection(sliceBodyBlocks(allBlocks, meta), meta);
        console.log(`Body has ${body.length} blocks (out of ${allBlocks.length})`);

        const imageMap = new Map<string, ExtractedImage>();
        for (const img of extracted.images) imageMap.set(img.id, img);

        const htmlContent = generateEditorHtml(meta, body, imageMap);

        const refSafe = (article.reference_number || "article").replace(/[^a-zA-Z0-9_-]/g, "_");
        const ts = Date.now();
        const pdfName = `formatted-${refSafe}-${ts}.pdf`;
        const docxName = `formatted-${refSafe}-${ts}.docx`;
        const HEAVY_ARTICLE = body.length > 250 || extracted.images.length > 4;

        let savedPdfName: string | null = null;
        let savedDocxName: string | null = null;

        if (!HEAVY_ARTICLE) {
          try {
            const pdfBuffer = generatePdf(meta, body, imageMap);
            const { error: pdfErr } = await supabase.storage
              .from("formatted-articles")
              .upload(pdfName, new Blob([pdfBuffer], { type: "application/pdf" }), {
                contentType: "application/pdf",
                upsert: true,
              });
            if (!pdfErr) savedPdfName = pdfName;
            else console.error("PDF upload error:", pdfErr);
          } catch (e) {
            console.error("PDF generation skipped:", e instanceof Error ? e.message : e);
          }

          try {
            const docxBuffer = await generateDocx(meta, body, imageMap);
            const { error: docxErr } = await supabase.storage
              .from("formatted-articles")
              .upload(docxName, new Blob([docxBuffer], {
                type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              }), {
                contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                upsert: true,
              });
            if (!docxErr) savedDocxName = docxName;
            else console.error("DOCX upload error:", docxErr);
          } catch (e) {
            console.error("DOCX generation skipped:", e instanceof Error ? e.message : e);
          }
        } else {
          console.log(`Skipping server PDF/DOCX for heavy article (${body.length} blocks, ${extracted.images.length} images) — client will export from HTML.`);
        }

        await supabase.from("articles").update({
          formatted_document_url: savedPdfName,
          formatted_docx_url: savedDocxName,
          formatting_status: "ready_for_review",
          formatting_suggestions: meta.suggestions || [],
          formatted_content: htmlContent,
          // A fresh format is rebuilt from the author's original submitted DOCX,
          // so any earlier galley-proof/author revision HTML must not override it.
          author_revision_html: null,
        } as any).eq("id", articleId);


        const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
        if (admins) {
          for (const admin of admins) {
            await supabase.from("notifications").insert({
              user_id: admin.user_id,
              title: "Article Formatted - Ready for Review ✏️",
              message: `"${article.title}" (${article.reference_number}) has been formatted with PDF + Word + figures preserved.`,
              type: "info",
              link: `/admin/formatting`,
            });
          }
        }
      } catch (e) {
        console.error("Background formatting failed:", e);
        try {
          await supabase.from("articles")
            .update({ formatting_status: "failed" })
            .eq("id", articleId);
        } catch (updateErr) {
          console.error("Failed to mark article failed:", updateErr);
        }
      }
    })();

    // Keep the isolate alive until background finishes.
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(bgTask);

    completed = true;
    return jsonResponse({
      success: true,
      status: "processing",
      articleId,
    }, 202);
  } catch (error) {
    console.error("Format article error:", error);
    if (stuckArticleId && stuckSupabase && !completed) {
      try {
        await stuckSupabase.from("articles")
          .update({ formatting_status: "failed" })
          .eq("id", stuckArticleId);
      } catch (e) {
        console.error("Failed to reset formatting_status:", e);
      }
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

