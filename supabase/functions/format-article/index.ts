import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.6.0";
import { jsPDF } from "npm:jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function extractDocxText(supabase: any, documentUrl: string): Promise<string> {
  console.log("Downloading document:", documentUrl);
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(documentUrl);
  if (downloadError || !fileData) {
    console.error("Download error:", downloadError?.message);
    throw new Error("Failed to download document: " + (downloadError?.message || "no data"));
  }
  const ab = await fileData.arrayBuffer();
  const buffer = new Uint8Array(ab);
  console.log("Document downloaded, size:", buffer.length, "bytes");
  // mammoth npm in Deno needs { buffer } (Buffer-like) not { arrayBuffer }
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

const WWJMRD_TEMPLATE_DESCRIPTION = `
You are a Journal Formatting Engine.

Your ONLY task is to FORMAT the provided research manuscript EXACTLY in the format of World Wide Journal of Multidisciplinary Research and Development (WWJMRD).

DO NOT rewrite.
DO NOT summarize.
DO NOT change wording.
DO NOT improve grammar.
DO NOT modify references.
DO NOT remove repetition.
DO NOT reinterpret statistics.

Your job is STRUCTURE CLONING ONLY.

========================
FORMAT STRUCTURE RULES
========================

1. HEADER BLOCK (Top of First Page)
Display in this exact order:
~ Page Number ~
WWJMRD YEAR; VOLUME(ISSUE): PAGE RANGE
www.wwjmrd.com
International Journal
Peer Reviewed Journal
Refereed Journal
Indexed Journal
Impact Factor SJIF – 2017: 5.182 2018: 5.51, (ISI) 2020-2021: 1.361
E-ISSN: 2454-6615

2. AUTHOR DETAILS (Left Aligned Block Style)
Each author must appear as:
Author Name
Designation, Institution, City, Country.

After all authors:
Correspondence:
Name
Designation, Institution, City, Country.

3. TITLE FORMAT
• Title must be in quotation marks
• Bold
• Center aligned
• Followed by author names in single line

4. SECTION ORDER (MANDATORY)
Use numbered headings (1., 2., 3., etc.) or Roman numerals (I., II., III.) for main sections.
Use lettered sub-headings (A., B., C.) under main sections.
Maintain logical section order from the original manuscript.
Common sections: Introduction, Literature Review / Background, Materials and Methods, Results, Discussion, Conclusions, Limitations, Recommendations, Conflict of Interest, Source of Funding, Ethical Clearance, References.
If original has custom sections, keep them in original order.
Do NOT add sections that don't exist in the original content. Only include headings that have content.

5. ABSTRACT FORMAT
• Single paragraph
• No bullet points
• 200–300 words
• Follow with: Keywords: keyword1, keyword2, keyword3

6. TABLE FORMAT RULES
All tables must follow:
Table No.X: Title
Column-based data
After each table write interpretation: "Table No.X shows that..."

7. GRAPH FORMAT RULES
Graphs labeled: Graph No. A: Title, Graph No. B: Title
Graph explanation: "Graph No. X represents..."

8. STATISTICAL PRESENTATION STYLE
Use exact style: Mean ± SD, P < 0.05, ANOVA, Independent t-test, Mann-Whitney test, etc.
Do not change statistical notation.

9. DISCUSSION STYLE RULES
• Compare with previous studies
• Cite in numeric bracket format (1), (2), (3)
• Explain physiological reasoning

10. CONCLUSION STYLE
• Summarize improvements
• Mention outcome measures

11. LIMITATIONS FORMAT
Bullet point style: • Point 1 • Point 2

12. REFERENCE STYLE
Numbered format: 1. 2. 3.
Web links allowed. Keep raw URLs. Do NOT convert to APA.

13. STRICT RULES
Preserve: Capitalization style, Table numbering, Mean ± format, Roman/Arabic numbering.

IMPORTANT: Return ALL content from the original. Do NOT omit any text. Structure the output using the provided JSON function.
`;

interface AuthorDetail {
  name: string;
  designation: string;
}

interface TableData {
  number: string;
  title: string;
  content: string;
  interpretation: string;
}

interface GraphData {
  label: string;
  title: string;
  description: string;
}

interface FormattedSection {
  heading: string;
  content: string;
}

interface FormattedArticle {
  header: {
    year: string;
    volume: string;
    issue: string;
    page_range: string;
  };
  authors: AuthorDetail[];
  correspondence: {
    name: string;
    designation: string;
  };
  title: string;
  abstract: string;
  keywords: string[];
  sections: FormattedSection[];
  tables: TableData[];
  graphs: GraphData[];
  references: string[];
  suggestions: Array<{
    type: string;
    message: string;
    severity: "info" | "warning" | "improvement";
  }>;
}

function generateFormattedHtml(formatted: FormattedArticle, article: any): string {
  const authors = formatted.authors || [];
  const authorNames = authors.map(a => a.name).join(", ");
  const authorDetails = authors.map(a => `<p style="margin:2px 0;font-size:9px;"><strong>${a.name}</strong><br/><span style="font-size:8px;">${a.designation || ''}</span></p>`).join("");
  const correspondence = formatted.correspondence;
  const corrBlock = correspondence?.name ? `<p style="margin:6px 0 4px;font-size:9px;"><strong>Correspondence:</strong><br/><strong>${correspondence.name}</strong><br/><span style="font-size:8px;">${correspondence.designation || ''}</span></p>` : '';
  const title = formatted.title || article.title;
  const abstract = formatted.abstract || article.abstract || '';
  const keywords = (formatted.keywords || article.keywords || []).join(", ");
  const bannerUrl = "https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/wwjmrd-banner.jpg";
  
  const yr = formatted.header?.year || new Date().getFullYear();
  const vol = formatted.header?.volume || "12";
  const iss = formatted.header?.issue || "01";
  const pgRange = formatted.header?.page_range || "01-10";
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentMonth = monthNames[new Date().getMonth()];

  const sectionsHtml = (formatted.sections || []).map(s => 
    `<h2 style="font-size:11px;font-weight:bold;margin:10px 0 4px;font-family:'Times New Roman',serif;">${s.heading}</h2><p style="text-align:justify;margin:3px 0;font-size:10px;line-height:1.5;font-family:'Times New Roman',serif;">${s.content}</p>`
  ).join("");

  const tablesHtml = (formatted.tables || []).map(t =>
    `<h3 style="font-size:10px;font-weight:bold;margin:8px 0 4px;font-family:'Times New Roman',serif;">Table No.${t.number}: ${t.title}</h3><p style="margin:3px 0;font-size:9px;font-family:'Times New Roman',serif;">${t.content}</p><p style="text-align:justify;margin:3px 0;font-size:10px;font-family:'Times New Roman',serif;">${t.interpretation}</p>`
  ).join("");

  const graphsHtml = (formatted.graphs || []).map(g =>
    `<h3 style="font-size:10px;font-weight:bold;margin:8px 0 4px;font-family:'Times New Roman',serif;">Graph No. ${g.label}: ${g.title}</h3><p style="text-align:justify;margin:3px 0;font-size:10px;font-family:'Times New Roman',serif;">${g.description}</p>`
  ).join("");

  const refsHtml = (formatted.references || []).length > 0
    ? `<h2 style="font-size:11px;font-weight:bold;margin:10px 0 4px;font-family:'Times New Roman',serif;">References</h2><ol style="margin:3px 0;padding-left:16px;font-size:9px;font-family:'Times New Roman',serif;line-height:1.5;">${formatted.references.map(r => `<li style="margin:1px 0;">${r}</li>`).join("")}</ol>`
    : '';

  return `
<div style="font-family:'Times New Roman',serif;max-width:800px;margin:0 auto;">
  <!-- Running Header -->
  <p style="text-align:center;font-size:9px;font-style:italic;font-weight:bold;margin:0 0 4px;border-bottom:1px solid #000;padding-bottom:3px;">
    World Wide Journal of Multidisciplinary Research and Development (${currentMonth}-${yr})
  </p>

  <!-- Banner Image -->
  <div style="margin:6px 0 10px;text-align:center;">
    <img src="${bannerUrl}" alt="WWJMRD Banner" style="width:100%;max-width:780px;height:auto;border-radius:4px;" />
  </div>
  
  <!-- Page 1: Sidebar + Content Layout -->
  <div style="display:flex;gap:10px;margin-bottom:10px;">
    <!-- Left Sidebar -->
    <div style="flex:0 0 180px;font-size:8px;border-right:1px solid #ccc;padding-right:8px;">
      <p style="margin:2px 0;font-size:8px;"><strong>WWJMRD ${yr}; ${vol}(${iss}): ${pgRange}</strong></p>
      <p style="margin:2px 0;font-size:8px;">www.wwjmrd.com</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">International Journal</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">Peer Reviewed Journal</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">Refereed Journal</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">Indexed Journal</p>
      <p style="margin:2px 0;font-size:7px;font-style:italic;">Impact Factor SJIF 2017: 5.182 2018: 5.51, (ISI) 2020-2021: 1.361</p>
      <p style="margin:2px 0;font-size:8px;font-style:italic;">E-ISSN: 2454-6615</p>
      <hr style="margin:6px 0;border:none;border-top:1px solid #ccc;"/>
      ${authorDetails}
      ${corrBlock}
    </div>
    <!-- Right Content -->
    <div style="flex:1;">
      <h1 style="font-size:13px;text-align:center;font-weight:bold;margin:8px 0;font-family:'Times New Roman',serif;">${title}</h1>
      <p style="text-align:center;font-weight:bold;margin:4px 0;font-size:10px;">${authorNames}</p>
      <h3 style="font-size:11px;font-weight:bold;margin:8px 0 4px;">Abstract</h3>
      <p style="text-align:justify;margin:3px 0;font-size:10px;line-height:1.5;">${abstract}</p>
      <p style="margin:6px 0;font-size:10px;"><strong>Keywords:</strong> ${keywords}</p>
    </div>
  </div>
  
  <!-- Remaining content in two-column flow -->
  <div style="column-count:2;column-gap:14px;font-family:'Times New Roman',serif;">
    ${sectionsHtml}
    ${tablesHtml}
    ${graphsHtml}
    ${refsHtml}
  </div>
</div>`;
}

function generateFormattedPdf(article: any, formatted: FormattedArticle): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const mL = 15; // left margin
  const mR = 15; // right margin
  const mTop = 15;
  const mBottom = 20;
  const fullW = pageWidth - mL - mR; // 180
  let y = 0;
  let pageNum = 1;

  // Colors
  const teal: [number, number, number] = [0, 128, 128];
  const black: [number, number, number] = [0, 0, 0];
  const darkGray: [number, number, number] = [51, 51, 51];
  const medGray: [number, number, number] = [102, 102, 102];

  // Month name helper
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentMonth = monthNames[new Date().getMonth()];
  const yr = formatted.header?.year || new Date().getFullYear().toString();
  const vol = formatted.header?.volume || "12";
  const iss = formatted.header?.issue || "01";
  const pgRange = formatted.header?.page_range || "01-10";

  function checkPageBreak(needed: number): boolean {
    if (y + needed > pageHeight - mBottom) {
      return true;
    }
    return false;
  }

  function addNewPage() {
    doc.addPage();
    pageNum++;
    y = mTop + 8; // space for running header
  }

  // Helper: draw justified text, returns final y
  function drawJustifiedText(text: string, x: number, maxW: number, size: number, color: [number, number, number], style = "normal", lineH = 4.2): number {
    doc.setFontSize(size);
    doc.setFont("times", style);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxW);
    for (let i = 0; i < lines.length; i++) {
      if (checkPageBreak(lineH)) {
        addNewPage();
      }
      // Justify all lines except last line of paragraph
      if (i < lines.length - 1) {
        doc.text(lines[i], x, y, { align: "justify", maxWidth: maxW });
      } else {
        doc.text(lines[i], x, y);
      }
      y += lineH;
    }
    return y;
  }

  // Helper: draw text in two columns, returns when done
  function drawTwoColumnText(text: string, colLeftX: number, colRightX: number, colW: number, size: number, color: [number, number, number], style = "normal", lineH = 4.0) {
    doc.setFontSize(size);
    doc.setFont("times", style);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, colW);
    let col = 0; // 0 = left, 1 = right
    let colX = colLeftX;

    for (let i = 0; i < lines.length; i++) {
      if (checkPageBreak(lineH)) {
        if (col === 0) {
          // Switch to right column
          col = 1;
          colX = colRightX;
          y = twoColStartY;
        } else {
          // Both columns full, new page
          addNewPage();
          twoColStartY = y;
          col = 0;
          colX = colLeftX;
        }
      }
      if (i < lines.length - 1) {
        doc.text(lines[i], colX, y, { align: "justify", maxWidth: colW });
      } else {
        doc.text(lines[i], colX, y);
      }
      y += lineH;
    }
  }

  let twoColStartY = mTop;

  // ==========================================
  // PAGE 1 - Special Layout
  // ==========================================

  // --- Running header ---
  y = 10;
  doc.setFontSize(9);
  doc.setFont("times", "bolditalic");
  doc.setTextColor(...black);
  doc.text(`World Wide Journal of Multidisciplinary Research and Development (${currentMonth}-${yr})`, pageWidth / 2, y, { align: "center" });
  y += 2;
  doc.setDrawColor(...black);
  doc.setLineWidth(0.5);
  doc.line(mL, y, pageWidth - mR, y);
  y += 2;

  // --- Banner Rectangle (simulating the teal banner image) ---
  const bannerH = 28;
  doc.setFillColor(0, 140, 140); // teal gradient
  doc.rect(mL, y, fullW, bannerH, "F");
  // Banner text
  doc.setFontSize(14);
  doc.setFont("times", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("WORLD WIDE JOURNAL OF", pageWidth / 2, y + 9, { align: "center" });
  doc.text("MULTIDISCIPLINARY RESEARCH AND", pageWidth / 2, y + 16, { align: "center" });
  doc.text("DEVELOPMENT", pageWidth / 2, y + 23, { align: "center" });
  y += bannerH + 6;

  // --- Two column layout ---
  const leftColX = mL;
  const leftColW = 50; // left sidebar width
  const rightColX = mL + leftColW + 5; // 5mm gap
  const rightColW = fullW - leftColW - 5;

  // LEFT COLUMN content
  let leftY = y;

  // WWJMRD citation
  doc.setFontSize(8);
  doc.setFont("times", "bold");
  doc.setTextColor(...black);
  doc.text(`WWJMRD ${yr}; ${vol}(${iss}): ${pgRange}`, leftColX, leftY);
  leftY += 4;

  doc.setFontSize(8);
  doc.setFont("times", "normal");
  doc.setTextColor(...black);
  doc.text("www.wwjmrd.com", leftColX, leftY);
  leftY += 4;

  // Journal labels (italic)
  doc.setFontSize(8);
  doc.setFont("times", "italic");
  const labels = ["International Journal", "Peer Reviewed Journal", "Refereed Journal", "Indexed Journal"];
  for (const label of labels) {
    doc.text(label, leftColX, leftY);
    leftY += 3.5;
  }

  // Impact factor
  doc.setFontSize(7.5);
  doc.setFont("times", "italic");
  doc.setTextColor(...black);
  const impactLines = doc.splitTextToSize("Impact Factor SJIF 2017: 5.182 2018: 5.51, (ISI) 2020-2021: 1.361", leftColW);
  for (const il of impactLines) {
    doc.text(il, leftColX, leftY);
    leftY += 3.5;
  }

  // E-ISSN
  doc.setFontSize(8);
  doc.setFont("times", "italic");
  doc.text("E-ISSN: 2454-6615", leftColX, leftY);
  leftY += 6;

  // Author details in left column
  if (formatted.authors?.length > 0) {
    for (const author of formatted.authors) {
      doc.setFontSize(9);
      doc.setFont("times", "bold");
      doc.setTextColor(...black);
      doc.text(author.name, leftColX, leftY);
      leftY += 4;
      if (author.designation) {
        doc.setFontSize(8);
        doc.setFont("times", "normal");
        doc.setTextColor(...black);
        const desLines = doc.splitTextToSize(author.designation, leftColW);
        for (const dl of desLines) {
          doc.text(dl, leftColX, leftY);
          leftY += 3.5;
        }
      }
      leftY += 3;
    }
  }

  // RIGHT COLUMN content
  let rightY = y;

  // Correspondence block (top of right column)
  if (formatted.correspondence?.name) {
    doc.setFontSize(9);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    doc.text("Correspondence:", rightColX, rightY);
    rightY += 4;
    doc.setFont("times", "bold");
    doc.text(formatted.correspondence.name, rightColX, rightY);
    rightY += 4;
    if (formatted.correspondence.designation) {
      doc.setFontSize(8);
      doc.setFont("times", "normal");
      const corrLines = doc.splitTextToSize(formatted.correspondence.designation, rightColW);
      for (const cl of corrLines) {
        doc.text(cl, rightColX, rightY);
        rightY += 3.5;
      }
    }
    rightY += 6;
  }

  // Title (large, bold, centered in right column)
  const titleText = formatted.title || article.title;
  doc.setFontSize(14);
  doc.setFont("times", "bold");
  doc.setTextColor(...black);
  const titleLines = doc.splitTextToSize(titleText, rightColW);
  for (const tl of titleLines) {
    doc.text(tl, rightColX + rightColW / 2, rightY, { align: "center" });
    rightY += 7;
  }
  rightY += 3;

  // Author names in a single line below title
  if (formatted.authors?.length > 0) {
    const authorLine = formatted.authors.map(a => a.name).join(", ");
    doc.setFontSize(10);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    const nameLines = doc.splitTextToSize(authorLine, rightColW);
    for (const nl of nameLines) {
      doc.text(nl, rightColX, rightY);
      rightY += 5;
    }
    rightY += 4;
  }

  // Abstract heading
  doc.setFontSize(10);
  doc.setFont("times", "bold");
  doc.setTextColor(...black);
  doc.text("Abstract", rightColX, rightY);
  rightY += 5;

  // Abstract content (justified in right column)
  const abstractText = formatted.abstract || article.abstract || "";
  doc.setFontSize(9);
  doc.setFont("times", "normal");
  doc.setTextColor(...black);
  const absLines = doc.splitTextToSize(abstractText, rightColW);
  for (let i = 0; i < absLines.length; i++) {
    if (rightY > pageHeight - mBottom) break; // overflow handled on next pages
    if (i < absLines.length - 1) {
      doc.text(absLines[i], rightColX, rightY, { align: "justify", maxWidth: rightColW });
    } else {
      doc.text(absLines[i], rightColX, rightY);
    }
    rightY += 3.8;
  }
  rightY += 3;

  // Keywords
  if (formatted.keywords?.length > 0 || article.keywords?.length > 0) {
    doc.setFontSize(9);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    const kwLabel = "Keywords: ";
    doc.text(kwLabel, rightColX, rightY);
    const kwLabelW = doc.getTextWidth(kwLabel);
    doc.setFont("times", "normal");
    const kw = (formatted.keywords || article.keywords || []).join(", ");
    const kwLines = doc.splitTextToSize(kw, rightColW - kwLabelW);
    doc.text(kwLines[0] || "", rightColX + kwLabelW, rightY);
    rightY += 4;
    for (let i = 1; i < kwLines.length; i++) {
      doc.text(kwLines[i], rightColX, rightY);
      rightY += 4;
    }
    rightY += 4;
  }

  // Continue first page right column with sections until page break
  y = rightY;
  let sectionIdx = 0;
  const sections = formatted.sections || [];

  // Render sections that fit on first page right column
  while (sectionIdx < sections.length && y < pageHeight - mBottom - 10) {
    const section = sections[sectionIdx];

    // Section heading
    doc.setFontSize(10);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    const headText = section.heading;
    if (y + 6 > pageHeight - mBottom) break;
    doc.text(headText, rightColX, y);
    y += 5;

    // Section content (justified in right column for page 1)
    if (section.content && section.content.trim()) {
      doc.setFontSize(9);
      doc.setFont("times", "normal");
      doc.setTextColor(...black);
      const secLines = doc.splitTextToSize(section.content, rightColW);
      for (let i = 0; i < secLines.length; i++) {
        if (y + 3.8 > pageHeight - mBottom) {
          // Mark that we need to continue this section
          // Store remaining lines info
          sectionIdx--; // will be incremented back
          break;
        }
        if (i < secLines.length - 1) {
          doc.text(secLines[i], rightColX, y, { align: "justify", maxWidth: rightColW });
        } else {
          doc.text(secLines[i], rightColX, y);
        }
        y += 3.8;
      }
      y += 2;
    }
    sectionIdx++;
  }

  // ==========================================
  // PAGES 2+ - Two Column Layout
  // ==========================================
  if (sectionIdx < sections.length || (formatted.tables?.length > 0) || (formatted.references?.length > 0)) {
    addNewPage();

    // Two column layout dimensions for pages 2+
    const col1X = mL;
    const col2X = pageWidth / 2 + 3;
    const colW = (fullW - 6) / 2; // 6mm gap between columns
    let currentCol = 0; // 0=left, 1=right
    let colX = col1X;
    twoColStartY = y;

    function switchColOrPage() {
      if (currentCol === 0) {
        currentCol = 1;
        colX = col2X;
        y = twoColStartY;
      } else {
        addNewPage();
        twoColStartY = y;
        currentCol = 0;
        colX = col1X;
      }
    }

    function drawColText(text: string, size: number, color: [number, number, number], style = "normal", lineH = 3.8) {
      doc.setFontSize(size);
      doc.setFont("times", style);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, colW);
      for (let i = 0; i < lines.length; i++) {
        if (y + lineH > pageHeight - mBottom) {
          switchColOrPage();
        }
        if (i < lines.length - 1) {
          doc.text(lines[i], colX, y, { align: "justify", maxWidth: colW });
        } else {
          doc.text(lines[i], colX, y);
        }
        y += lineH;
      }
    }

    function drawColHeading(text: string) {
      if (y + 8 > pageHeight - mBottom) {
        switchColOrPage();
      }
      doc.setFontSize(10);
      doc.setFont("times", "bold");
      doc.setTextColor(...black);
      doc.text(text, colX, y);
      y += 5;
    }

    // Continue remaining sections
    for (let i = sectionIdx; i < sections.length; i++) {
      const section = sections[i];
      drawColHeading(section.heading);
      if (section.content && section.content.trim()) {
        drawColText(section.content, 9, black, "normal", 3.8);
        y += 2;
      }
    }

    // Tables
    if (formatted.tables?.length > 0) {
      for (const table of formatted.tables) {
        drawColHeading(`Table No.${table.number}: ${table.title}`);
        if (table.content) {
          drawColText(table.content, 8, darkGray, "normal", 3.5);
          y += 2;
        }
        if (table.interpretation) {
          drawColText(table.interpretation, 9, black, "normal", 3.8);
          y += 2;
        }
      }
    }

    // Graphs
    if (formatted.graphs?.length > 0) {
      for (const graph of formatted.graphs) {
        drawColHeading(`Graph No. ${graph.label}: ${graph.title}`);
        if (graph.description) {
          drawColText(graph.description, 9, black, "normal", 3.8);
          y += 2;
        }
      }
    }

    // References
    if (formatted.references?.length > 0) {
      drawColHeading("References");
      for (let i = 0; i < formatted.references.length; i++) {
        const refText = `${i + 1}. ${formatted.references[i]}`;
        drawColText(refText, 8, black, "normal", 3.5);
        y += 1;
      }
    }
  }

  // ==========================================
  // HEADERS & FOOTERS on all pages
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Running header on pages 2+
    if (i > 1) {
      doc.setFontSize(8);
      doc.setFont("times", "normal");
      doc.setTextColor(...black);
      doc.text("World Wide Journal of Multidisciplinary Research and Development", mL, 10);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(mL, 12, pageWidth - mR, 12);
    }

    // Page number footer
    doc.setFontSize(9);
    doc.setFont("times", "normal");
    doc.setTextColor(...medGray);
    doc.text(`~ ${i} ~`, pageWidth / 2, pageHeight - 10, { align: "center" });
  }

  return doc.output("arraybuffer");
}

// ===== Galley Proof Email Template (matches send-email style) =====
function buildGalleyProofEmail(opts: {
  isAdmin: boolean;
  articleTitle: string;
  referenceNumber: string;
  authorName: string;
  authorEmail: string;
}): string {
  const { isAdmin, articleTitle, referenceNumber, authorName, authorEmail } = opts;
  const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const h1 = (t: string) => `<h1 style="font-family:${font};font-size:24px;font-weight:600;color:#ffffff;text-align:center;margin:0 0 24px;">${t}</h1>`;
  const p = (t: string) => `<p style="font-family:${font};font-size:16px;line-height:26px;color:#d1d5db;margin:16px 0;">${t}</p>`;
  const divider = () => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr><td style="border-top:1px solid rgba(255,255,255,0.1);"></td></tr></table>`;
  const infoRow = (label: string, value: string, vs = "") =>
    `<tr><td style="font-family:${font};font-size:14px;color:#9ca3af;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">${label}</td><td align="right" style="font-family:${font};font-size:14px;color:#ffffff;font-weight:500;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);${vs}">${value}</td></tr>`;
  const btn = (href: string, label: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;"><tr><td align="center"><a href="${href}" target="_blank" style="display:inline-block;background-color:#00d4ff;color:#0d1528;font-family:${font};font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">${label}</a></td></tr></table>`;
  const footer = (t: string) => `<p style="font-family:${font};font-size:14px;line-height:22px;color:#9ca3af;margin:16px 0 0;">${t}</p>`;

  const rows = [
    infoRow("Reference Number", esc(referenceNumber)),
    infoRow("Title", esc(articleTitle)),
    infoRow("Author", esc(authorName)),
    ...(isAdmin ? [infoRow("Email", esc(authorEmail))] : []),
    infoRow("Status", "Galley Proof Ready", " color:#10b981; font-weight:600;"),
  ].join("");

  const infoBox = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340;border-radius:8px;margin:20px 0;"><tr><td style="padding:20px;"><p style="font-family:${font};font-size:16px;font-weight:600;color:#ffffff;margin:0 0 12px;">Article Details:</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr></table>`;

  let body: string;
  if (isAdmin) {
    body = `
      ${h1("Galley Proof Ready for Review 📝")}
      ${p(`A galley proof has been generated for the following article and is ready for your review.`)}
      ${infoBox}
      ${btn("https://wwjmrdai.lovable.app/admin/formatting", "Review Galley Proof")}
      ${divider()}
      ${footer("This is an automated notification from WWJMRD. For any queries, contact support@wwjmrd.com")}
    `;
  } else {
    body = `
      ${h1("Galley Proof Generated 📄")}
      ${p(`Hi ${esc(authorName)},`)}
      ${p(`The galley proof for your article has been generated and is pending admin review. You will be notified once it has been approved.`)}
      ${infoBox}
      ${btn("https://wwjmrdai.lovable.app/author/articles", "View My Articles")}
      ${divider()}
      ${footer("If you have any questions, contact us at support@wwjmrd.com")}
    `;
  }

  return `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Galley Proof</title></head><body style="margin:0;padding:0;background-color:#0d1528;width:100%;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0d1528" style="background-color:#0d1528;"><tr><td align="center" style="padding:40px 16px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;"><tr><td align="center" style="padding-bottom:32px;"><img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" style="display:block;max-width:200px;height:auto;" /></td></tr><tr><td bgcolor="#151d35" style="background-color:#151d35;border-radius:12px;padding:32px 28px;border:1px solid rgba(255,255,255,0.08);">${body}</td></tr><tr><td align="center" style="padding-top:24px;"><p style="font-family:${font};font-size:12px;color:#6b7280;margin:0;">&copy; ${new Date().getFullYear()} WWJMRD. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
}

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
    if (claimsError || !claimsData?.claims) {
      console.error("Auth verification failed:", claimsError?.message);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

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

    // Update status to formatting
    await supabase.from("articles").update({ formatting_status: "formatting" }).eq("id", articleId);

    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*, profiles:author_id (full_name, email)")
      .eq("id", articleId)
      .single();

    if (articleError || !article) return jsonResponse({ error: "Article not found" }, 404);

    // Extract text from document
    let documentText = "";
    if (article.document_url) {
      try {
        documentText = await extractDocxText(supabase, article.document_url);
      } catch (err) {
        console.error("Document extraction failed:", err);
      }
    }

    if (!documentText) {
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "No document text could be extracted" }, 400);
    }

    const contentToFormat = `Title: ${article.title}\nAbstract: ${article.abstract || ""}\nKeywords: ${(article.keywords || []).join(", ")}\nAuthor: ${article.author_name || (article.profiles as any)?.full_name || ""}\n\n--- Full Document Content ---\n${documentText.substring(0, 40000)}`;

    console.log("Sending article for AI formatting:", article.reference_number, "Length:", contentToFormat.length);

    // Call AI for reformatting
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: WWJMRD_TEMPLATE_DESCRIPTION },
          {
            role: "user",
            content: `Please reformat this article into the WWJMRD publication style. Return the result as structured JSON using the provided function. Preserve ALL original content.\n\n${contentToFormat}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "format_article",
              description: "Return the reformatted article in WWJMRD publication style.",
              parameters: {
                type: "object",
                properties: {
                  header: {
                    type: "object",
                    properties: {
                      year: { type: "string", description: "Publication year e.g. 2025" },
                      volume: { type: "string", description: "Volume number e.g. 11" },
                      issue: { type: "string", description: "Issue number e.g. 12" },
                      page_range: { type: "string", description: "Page range e.g. 33-43" },
                    },
                    required: ["year", "volume", "issue", "page_range"],
                  },
                  title: { type: "string", description: "Article title without quotes" },
                  authors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Full name" },
                        designation: { type: "string", description: "Designation, Institution, City, Country" },
                      },
                      required: ["name", "designation"],
                    },
                  },
                  correspondence: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      designation: { type: "string" },
                    },
                    required: ["name", "designation"],
                  },
                  abstract: { type: "string", description: "Single paragraph abstract" },
                  keywords: { type: "array", items: { type: "string" } },
                  sections: {
                    type: "array",
                    description: "Sections in WWJMRD mandatory order: Introduction, Need of the Study, Aims And Objectives, Materials And Methodology, Study Design, Sample Size, Inclusion Criteria, Exclusion Criteria, Assessment Parameters, Flow Chart of Sampling Method, Result, Discussion, Conclusions, Limitations, Recommendations, Conflict Of Interest, Source of Funding, Ethical Clearance. Include heading even if content is empty.",
                    items: {
                      type: "object",
                      properties: {
                        heading: { type: "string" },
                        content: { type: "string" },
                      },
                      required: ["heading", "content"],
                    },
                  },
                  tables: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        number: { type: "string", description: "Table number e.g. 1" },
                        title: { type: "string" },
                        content: { type: "string", description: "Table data as text" },
                        interpretation: { type: "string", description: "Paragraph starting with Table No.X shows that..." },
                      },
                      required: ["number", "title", "content", "interpretation"],
                    },
                  },
                  graphs: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", description: "Graph label e.g. A, B, C or 1, 2, 3" },
                        title: { type: "string" },
                        description: { type: "string", description: "Paragraph starting with Graph No. X represents..." },
                      },
                      required: ["label", "title", "description"],
                    },
                  },
                  references: { type: "array", items: { type: "string" }, description: "Numbered references. Keep raw URLs. Do NOT convert to APA." },
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
                required: ["title", "authors", "correspondence", "abstract", "keywords", "sections", "tables", "graphs", "references", "suggestions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "format_article" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI formatting error:", aiResponse.status, errText);
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      if (aiResponse.status === 429) return jsonResponse({ error: "Rate limited. Please try again later." }, 429);
      if (aiResponse.status === 402) return jsonResponse({ error: "AI credits exhausted." }, 402);
      return jsonResponse({ error: "AI formatting failed" }, 500);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "AI returned invalid response" }, 500);
    }

    let formatted: FormattedArticle;
    try {
      formatted = JSON.parse(toolCall.function.arguments);
    } catch {
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "Failed to parse AI formatted result" }, 500);
    }

    console.log("AI formatting complete. Generating PDF and HTML content...");

    // Generate HTML content for admin editing
    const htmlContent = generateFormattedHtml(formatted, article);

    const pdfBuffer = generateFormattedPdf(article, formatted);
    const pdfBlob = new Blob([pdfBuffer], { type: "application/pdf" });
    const fileName = `formatted-${article.reference_number}-${Date.now()}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("formatted-articles")
      .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "Failed to upload formatted article" }, 500);
    }

    await supabase.from("articles").update({
      formatted_document_url: fileName,
      formatting_status: "ready_for_review",
      formatting_suggestions: formatted.suggestions || [],
      formatted_content: htmlContent,
    } as any).eq("id", articleId);

    // Notify admins that formatting is ready for review (no galley proof email yet)
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    if (admins) {
      for (const admin of admins) {
        await supabase.from("notifications").insert({
          user_id: admin.user_id,
          title: "Article Formatted - Ready for Review ✏️",
          message: `"${article.title}" (${article.reference_number}) has been formatted. Please review and edit before approving.`,
          type: "info",
          link: `/admin/formatting`,
        });
      }
    }

    return jsonResponse({
      success: true,
      formatted: true,
      suggestions: formatted.suggestions,
      fileName,
    });
  } catch (error) {
    console.error("Format article error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
