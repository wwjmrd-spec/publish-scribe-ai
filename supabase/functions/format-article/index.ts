import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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
- References: array of references in the order they appear, with their original numbering removed (we'll re-number). Keep raw URLs.
- body_start_heading: the EXACT text of the first heading where the main body begins (usually "Introduction" or "1. Introduction" — copy exactly as it appears).
- references_heading: the EXACT text of the references section heading (e.g. "References" or "Bibliography" — copy exactly).

DO NOT rewrite text. DO NOT summarize. Copy verbatim from the source.
`;

async function extractMetadata(rawText: string, lovableApiKey: string, fallbackTitle: string): Promise<ArticleMetadata> {
  const truncated = rawText.substring(0, 35000);

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
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
    }),
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
  return meta;
}

// =========================================================================
// 4. SLICE THE BODY  — keep blocks BETWEEN intro heading and references heading
// =========================================================================

function normHeading(s: string): string {
  return s.toLowerCase().replace(/^\s*\d+[.)]?\s*/, "").replace(/[^a-z0-9]/g, "").trim();
}

function sliceBodyBlocks(blocks: Block[], meta: ArticleMetadata): Block[] {
  const startKey = normHeading(meta.body_start_heading || "introduction");
  const refKey = normHeading(meta.references_heading || "references");
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
  if (start < 0) {
    // Fall back: drop everything up to the first paragraph that's longer than the abstract
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === "heading") { start = i; break; }
    }
    if (start < 0) start = 0;
  }
  return blocks.slice(start, end);
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

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const authorsBlock = (meta.authors || []).map(a =>
    `<p style="margin:2px 0;font-size:9px;"><strong>${esc(a.name)}</strong><br/><span style="font-size:8px;font-style:italic;">${esc(a.designation || "")}</span></p>`
  ).join("");

  const corrBlock = meta.correspondence?.name
    ? `<p style="margin:8px 0 2px;font-size:9px;"><strong>Correspondence:</strong><br/><strong>${esc(meta.correspondence.name)}</strong><br/><span style="font-size:8px;font-style:italic;">${esc(meta.correspondence.designation || "")}</span></p>`
    : "";

  const renderImage = (id: string, caption?: string) => {
    const img = images.get(id);
    if (!img) return "";
    const dataUrl = `data:${img.mime};base64,${bytesToBase64(img.data)}`;
    const cap = caption ? `<p style="text-align:center;font-weight:bold;font-style:italic;font-size:10px;margin:2px 0 8px;">${esc(caption)}</p>` : "";
    return `<div style="text-align:center;margin:8px 0;"><img src="${dataUrl}" style="max-width:100%;height:auto;display:inline-block;" alt="figure"/></div>${cap}`;
  };

  const renderTable = (rows: string[][]) => {
    const trs = rows.map((r, ri) =>
      `<tr>${r.map(c => `<${ri === 0 ? "th" : "td"}>${esc(c)}</${ri === 0 ? "th" : "td"}>`).join("")}</tr>`
    ).join("");
    return `<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:10px;">${trs}</table>`;
  };

  const bodyHtml = body.map(b => {
    if (b.kind === "heading") {
      const tag = `h${b.level}`;
      const sz = b.level === 1 ? 13 : b.level === 2 ? 12 : 11;
      return `<${tag} style="font-size:${sz}px;font-weight:bold;margin:10px 0 4px;">${esc(b.text)}</${tag}>`;
    }
    if (b.kind === "paragraph") return `<p style="text-align:justify;font-size:10px;line-height:1.5;margin:4px 0;">${esc(b.text)}</p>`;
    if (b.kind === "image") return renderImage(b.id, b.caption);
    if (b.kind === "table") return renderTable(b.rows);
    if (b.kind === "list") {
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag} style="font-size:10px;margin:4px 0 4px 20px;">${b.items.map(i => `<li>${esc(i)}</li>`).join("")}</${tag}>`;
    }
    return "";
  }).join("");

  const refsHtml = (meta.references?.length || 0) > 0
    ? `<h2 style="font-size:12px;font-weight:bold;margin:12px 0 4px;">References</h2><ol style="font-size:9px;padding-left:18px;line-height:1.5;">${meta.references.map(r => `<li>${esc(r)}</li>`).join("")}</ol>`
    : "";

  return `
<div style="font-family:'Times New Roman',serif;color:#000;">
  <!-- Running Header -->
  <p style="text-align:center;font-size:9px;font-style:italic;font-weight:bold;margin:0 0 4px;border-bottom:1px solid #000;padding-bottom:3px;">
    World Wide Journal of Multidisciplinary Research and Development (${currentMonth}-${yr})
  </p>

  <!-- Banner -->
  <div style="background:linear-gradient(135deg,#008080,#006666);color:white;padding:18px;text-align:center;margin:8px 0 12px;border-radius:2px;">
    <div style="font-size:18px;font-weight:bold;line-height:1.3;">
      WORLD WIDE JOURNAL OF<br/>MULTIDISCIPLINARY RESEARCH AND<br/>DEVELOPMENT
    </div>
  </div>

  <!-- Sidebar + Content -->
  <div style="display:flex;gap:12px;margin-bottom:14px;">
    <div style="flex:0 0 170px;border-right:1px solid #999;padding-right:10px;font-size:8px;">
      <p style="margin:2px 0;font-size:8px;"><strong>WWJMRD ${yr}; ${vol}(${iss}): ${pgRange}</strong></p>
      <p style="margin:2px 0;font-size:8px;">www.wwjmrd.com</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">International Journal</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">Peer Reviewed Journal</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">Refereed Journal</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">Indexed Journal</p>
      <p style="margin:2px 0;font-size:7px;font-style:italic;">Impact Factor SJIF 2017: 5.182 2018: 5.51, (ISI) 2020-2021: 1.361</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">E-ISSN: 2454-6615</p>
      <hr style="margin:6px 0;border:none;border-top:1px solid #ccc;"/>
      ${authorsBlock}
      ${corrBlock}
    </div>
    <div style="flex:1;">
      <h1 style="font-size:14px;text-align:center;font-weight:bold;margin:6px 0 8px;">${esc(meta.title)}</h1>
      <p style="text-align:center;font-weight:bold;margin:4px 0 8px;font-size:11px;">${esc((meta.authors || []).map(a => a.name).join(", "))}</p>
      <h3 style="font-size:11px;font-weight:bold;margin:8px 0 4px;">Abstract</h3>
      <p style="text-align:justify;font-size:10px;line-height:1.5;margin:3px 0;">${esc(meta.abstract || "")}</p>
      <p style="margin:6px 0;font-size:10px;"><strong>Keywords:</strong> <em>${esc((meta.keywords || []).join(", "))}</em></p>
    </div>
  </div>

  <!-- Body in two columns -->
  <div style="column-count:2;column-gap:14px;">
    ${bodyHtml}
    ${refsHtml}
  </div>
</div>`;
}

// =========================================================================
// 9. MAIN HANDLER
// =========================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return jsonResponse({ error: "Unauthorized" }, 401);

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    if (roleData?.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403);

    const { articleId } = await req.json();
    if (!articleId) return jsonResponse({ error: "Article ID required" }, 400);

    await supabase.from("articles").update({ formatting_status: "formatting" }).eq("id", articleId);

    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*, profiles:author_id (full_name, email)")
      .eq("id", articleId)
      .single();
    if (articleError || !article) return jsonResponse({ error: "Article not found" }, 404);
    if (!article.document_url) {
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "Article has no source DOCX" }, 400);
    }

    // 1. Extract DOCX
    let extracted: { html: string; rawText: string; images: ExtractedImage[] };
    try {
      extracted = await extractDocx(supabase, article.document_url);
    } catch (e) {
      console.error("Extraction failed:", e);
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "Failed to extract document content" }, 500);
    }
    if (!extracted.rawText || extracted.rawText.trim().length < 100) {
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "Document is too short or empty" }, 400);
    }

    // 2. Parse into blocks
    const allBlocks = parseHtmlToBlocks(extracted.html);
    console.log(`Parsed ${allBlocks.length} blocks from DOCX html`);

    // 3. AI metadata extraction
    let meta: ArticleMetadata;
    try {
      meta = await extractMetadata(extracted.rawText, lovableApiKey, article.title || "Untitled");
    } catch (e: any) {
      console.error("Metadata extraction failed:", e?.message);
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      if (e?.message === "RATE_LIMIT") return jsonResponse({ error: "Rate limited. Please try again later." }, 429);
      if (e?.message === "CREDITS_EXHAUSTED") return jsonResponse({ error: "AI credits exhausted." }, 402);
      return jsonResponse({ error: "AI metadata extraction failed" }, 500);
    }

    // 4. Slice body
    const body = sliceBodyBlocks(allBlocks, meta);
    console.log(`Body has ${body.length} blocks (out of ${allBlocks.length})`);

    // Image lookup map
    const imageMap = new Map<string, ExtractedImage>();
    for (const img of extracted.images) imageMap.set(img.id, img);

    // 5. Generate PDF
    let pdfBuffer: ArrayBuffer;
    try {
      pdfBuffer = generatePdf(meta, body, imageMap);
    } catch (e) {
      console.error("PDF generation failed:", e);
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "PDF generation failed: " + (e instanceof Error ? e.message : String(e)) }, 500);
    }

    // 6. Generate DOCX
    let docxBuffer: Uint8Array;
    try {
      docxBuffer = await generateDocx(meta, body, imageMap);
    } catch (e) {
      console.error("DOCX generation failed:", e);
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "DOCX generation failed: " + (e instanceof Error ? e.message : String(e)) }, 500);
    }

    // 7. Upload both
    const refSafe = (article.reference_number || "article").replace(/[^a-zA-Z0-9_-]/g, "_");
    const ts = Date.now();
    const pdfName = `formatted-${refSafe}-${ts}.pdf`;
    const docxName = `formatted-${refSafe}-${ts}.docx`;

    const { error: pdfErr } = await supabase.storage
      .from("formatted-articles")
      .upload(pdfName, new Blob([pdfBuffer], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (pdfErr) {
      console.error("PDF upload error:", pdfErr);
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "Failed to upload PDF" }, 500);
    }

    const { error: docxErr } = await supabase.storage
      .from("formatted-articles")
      .upload(docxName, new Blob([docxBuffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }), {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (docxErr) {
      console.error("DOCX upload error:", docxErr);
      // Still keep PDF; just warn
    }

    // 8. Generate editor HTML
    const htmlContent = generateEditorHtml(meta, body, imageMap);

    // 9. Save record
    await supabase.from("articles").update({
      formatted_document_url: pdfName,
      formatted_docx_url: docxErr ? null : docxName,
      formatting_status: "ready_for_review",
      formatting_suggestions: meta.suggestions || [],
      formatted_content: htmlContent,
    } as any).eq("id", articleId);

    // 10. Notify admins
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

    return jsonResponse({
      success: true,
      pdfName,
      docxName: docxErr ? null : docxName,
      imagesEmbedded: extracted.images.length,
      blocksRendered: body.length,
      suggestions: meta.suggestions,
    });
  } catch (error) {
    console.error("Format article error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
