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
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(documentUrl);
  if (downloadError || !fileData) throw new Error("Failed to download document");
  const arrayBuffer = await fileData.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
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
Maintain EXACT section order:
Abstract, Keywords, Introduction, Need of the Study, Aims And Objectives,
Materials And Methodology, Study Design, Sample Size, Inclusion Criteria,
Exclusion Criteria, Assessment Parameters, Flow Chart of Sampling Method,
Result, Tables, Graphs, Discussion, Conclusions, Limitations,
Recommendations, Conflict Of Interest, Source of Funding, Ethical Clearance, References

Do NOT change order. If a section is missing from content, include the heading but leave content empty.

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

function generateFormattedPdf(article: any, formatted: FormattedArticle): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 18;
  const marginRight = 18;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 0;
  let pageNum = 1;

  const brandBlue: [number, number, number] = [0, 51, 153];
  const black: [number, number, number] = [0, 0, 0];
  const darkGray: [number, number, number] = [51, 51, 51];
  const medGray: [number, number, number] = [102, 102, 102];

  function checkPageBreak(needed: number) {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 20;
      pageNum++;
    }
  }

  function addText(text: string, x: number, maxW: number, size: number, color: [number, number, number], style = "normal", lh = 4.5): number {
    doc.setFontSize(size);
    doc.setFont("times", style);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxW);
    for (const line of lines) {
      checkPageBreak(lh);
      doc.text(line, x, y);
      y += lh;
    }
    return y;
  }

  // ===== FIRST PAGE HEADER =====
  y = 12;
  // Page number top
  doc.setFontSize(9);
  doc.setFont("times", "normal");
  doc.setTextColor(...medGray);
  doc.text("~ 1 ~", pageWidth / 2, y, { align: "center" });
  y += 6;

  // WWJMRD citation line
  const yr = formatted.header?.year || new Date().getFullYear().toString();
  const vol = formatted.header?.volume || "11";
  const iss = formatted.header?.issue || "1";
  const pgRange = formatted.header?.page_range || "01-10";
  doc.setFontSize(9);
  doc.setFont("times", "bold");
  doc.setTextColor(...brandBlue);
  doc.text(`WWJMRD ${yr}; ${vol}(${iss}): ${pgRange}`, pageWidth / 2, y, { align: "center" });
  y += 5;

  // www.wwjmrd.com
  doc.setFontSize(9);
  doc.setFont("times", "normal");
  doc.setTextColor(...brandBlue);
  doc.text("www.wwjmrd.com", pageWidth / 2, y, { align: "center" });
  y += 5;

  // Journal labels stacked
  const labels = [
    "International Journal",
    "Peer Reviewed Journal",
    "Refereed Journal",
    "Indexed Journal",
  ];
  doc.setFontSize(8);
  doc.setFont("times", "italic");
  doc.setTextColor(...medGray);
  for (const label of labels) {
    doc.text(label, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }

  // Impact Factor
  doc.setFontSize(8);
  doc.setFont("times", "bold");
  doc.setTextColor(...darkGray);
  doc.text("Impact Factor SJIF – 2017: 5.182  2018: 5.51,  (ISI) 2020-2021: 1.361", pageWidth / 2, y, { align: "center" });
  y += 5;

  // E-ISSN
  doc.setFontSize(9);
  doc.setFont("times", "bold");
  doc.setTextColor(...brandBlue);
  doc.text("E-ISSN: 2454-6615", pageWidth / 2, y, { align: "center" });
  y += 4;

  // Double line separator
  doc.setDrawColor(...brandBlue);
  doc.setLineWidth(0.6);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 1.5;
  doc.setLineWidth(0.2);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 6;

  // ===== AUTHOR DETAILS (Left Aligned Block) =====
  if (formatted.authors?.length > 0) {
    for (const author of formatted.authors) {
      checkPageBreak(10);
      doc.setFontSize(10);
      doc.setFont("times", "bold");
      doc.setTextColor(...black);
      doc.text(author.name, marginLeft, y);
      y += 4.5;
      if (author.designation) {
        doc.setFontSize(9);
        doc.setFont("times", "italic");
        doc.setTextColor(...medGray);
        const desLines = doc.splitTextToSize(author.designation, contentWidth);
        for (const dl of desLines) {
          doc.text(dl, marginLeft, y);
          y += 3.5;
        }
      }
      y += 2;
    }

    // Correspondence
    if (formatted.correspondence?.name) {
      checkPageBreak(12);
      y += 2;
      doc.setFontSize(10);
      doc.setFont("times", "bold");
      doc.setTextColor(...black);
      doc.text("Correspondence:", marginLeft, y);
      y += 5;
      doc.setFont("times", "bold");
      doc.text(formatted.correspondence.name, marginLeft, y);
      y += 4.5;
      if (formatted.correspondence.designation) {
        doc.setFontSize(9);
        doc.setFont("times", "italic");
        doc.setTextColor(...medGray);
        const corrLines = doc.splitTextToSize(formatted.correspondence.designation, contentWidth);
        for (const cl of corrLines) {
          doc.text(cl, marginLeft, y);
          y += 3.5;
        }
      }
      y += 4;
    }
  }

  // Thin separator
  doc.setDrawColor(...medGray);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 6;

  // ===== TITLE (Centered, Bold, in Quotation Marks) =====
  checkPageBreak(15);
  const titleText = `"${formatted.title || article.title}"`;
  doc.setFontSize(13);
  doc.setFont("times", "bold");
  doc.setTextColor(...black);
  const titleLines = doc.splitTextToSize(titleText, contentWidth - 10);
  for (const tl of titleLines) {
    checkPageBreak(7);
    doc.text(tl, pageWidth / 2, y, { align: "center" });
    y += 7;
  }
  y += 2;

  // Author names in single line below title
  if (formatted.authors?.length > 0) {
    const authorLine = formatted.authors.map(a => a.name).join(", ");
    doc.setFontSize(10);
    doc.setFont("times", "normal");
    doc.setTextColor(...darkGray);
    const nameLines = doc.splitTextToSize(authorLine, contentWidth - 20);
    for (const nl of nameLines) {
      checkPageBreak(5);
      doc.text(nl, pageWidth / 2, y, { align: "center" });
      y += 5;
    }
    y += 4;
  }

  // ===== ABSTRACT =====
  if (formatted.abstract || article.abstract) {
    checkPageBreak(12);
    doc.setFontSize(11);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    doc.text("Abstract", marginLeft, y);
    y += 6;
    addText(formatted.abstract || article.abstract || "", marginLeft, contentWidth, 10, darkGray, "normal", 4.5);
    y += 4;
  }

  // ===== KEYWORDS =====
  if (formatted.keywords?.length > 0 || article.keywords?.length > 0) {
    checkPageBreak(10);
    doc.setFontSize(10);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    const kwLabel = "Keywords: ";
    doc.text(kwLabel, marginLeft, y);
    const kwLabelW = doc.getTextWidth(kwLabel);
    doc.setFont("times", "normal");
    doc.setTextColor(...darkGray);
    const kw = (formatted.keywords || article.keywords || []).join(", ");
    const kwLines = doc.splitTextToSize(kw, contentWidth - kwLabelW);
    doc.text(kwLines[0] || "", marginLeft + kwLabelW, y);
    y += 4.5;
    for (let i = 1; i < kwLines.length; i++) {
      doc.text(kwLines[i], marginLeft, y);
      y += 4.5;
    }
    y += 4;
  }

  // ===== SECTIONS =====
  if (formatted.sections?.length > 0) {
    for (const section of formatted.sections) {
      checkPageBreak(12);
      // Section heading
      doc.setFontSize(11);
      doc.setFont("times", "bold");
      doc.setTextColor(...black);
      doc.text(section.heading, marginLeft, y);
      y += 6;

      // Section content
      if (section.content && section.content.trim()) {
        addText(section.content, marginLeft, contentWidth, 10, darkGray, "normal", 4.5);
        y += 3;
      }
      y += 2;
    }
  }

  // ===== TABLES =====
  if (formatted.tables?.length > 0) {
    checkPageBreak(12);
    doc.setFontSize(11);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    doc.text("Tables", marginLeft, y);
    y += 6;

    for (const table of formatted.tables) {
      checkPageBreak(15);
      // Table heading
      doc.setFontSize(10);
      doc.setFont("times", "bold");
      doc.setTextColor(...black);
      doc.text(`Table No.${table.number}: ${table.title}`, marginLeft, y);
      y += 5;

      // Table content
      if (table.content) {
        addText(table.content, marginLeft, contentWidth, 9, darkGray, "normal", 4);
        y += 3;
      }

      // Interpretation
      if (table.interpretation) {
        addText(table.interpretation, marginLeft, contentWidth, 10, darkGray, "normal", 4.5);
        y += 4;
      }
    }
  }

  // ===== GRAPHS =====
  if (formatted.graphs?.length > 0) {
    checkPageBreak(12);
    doc.setFontSize(11);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    doc.text("Graphs", marginLeft, y);
    y += 6;

    for (const graph of formatted.graphs) {
      checkPageBreak(12);
      doc.setFontSize(10);
      doc.setFont("times", "bold");
      doc.setTextColor(...black);
      doc.text(`Graph No. ${graph.label}: ${graph.title}`, marginLeft, y);
      y += 5;

      if (graph.description) {
        addText(graph.description, marginLeft, contentWidth, 10, darkGray, "normal", 4.5);
        y += 3;
      }
    }
  }

  // ===== REFERENCES =====
  if (formatted.references?.length > 0) {
    checkPageBreak(12);
    y += 3;
    doc.setFontSize(11);
    doc.setFont("times", "bold");
    doc.setTextColor(...black);
    doc.text("References", marginLeft, y);
    y += 6;

    for (let i = 0; i < formatted.references.length; i++) {
      checkPageBreak(8);
      const refNum = `${i + 1}. `;
      doc.setFontSize(9);
      doc.setFont("times", "normal");
      doc.setTextColor(...darkGray);
      const numW = doc.getTextWidth(refNum);
      doc.text(refNum, marginLeft, y);
      const refLines = doc.splitTextToSize(formatted.references[i], contentWidth - numW - 2);
      for (let j = 0; j < refLines.length; j++) {
        doc.text(refLines[j], marginLeft + numW, y);
        y += 4;
      }
      y += 1;
    }
  }

  // ===== FOOTERS & HEADERS ON ALL PAGES =====
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Running header on pages after first
    if (i > 1) {
      doc.setFontSize(7.5);
      doc.setFont("times", "italic");
      doc.setTextColor(...medGray);
      doc.text("World Wide Journal of Multidisciplinary Research and Development", pageWidth / 2, 8, { align: "center" });
      doc.setDrawColor(...brandBlue);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, 10, pageWidth - marginRight, 10);
    }

    // Bottom separator
    doc.setDrawColor(...brandBlue);
    doc.setLineWidth(0.4);
    doc.line(marginLeft, pageHeight - 14, pageWidth - marginRight, pageHeight - 14);

    // Page number footer
    doc.setFontSize(9);
    doc.setFont("times", "normal");
    doc.setTextColor(...medGray);
    doc.text(`~ ${i} ~`, pageWidth / 2, pageHeight - 9, { align: "center" });
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
      ${footer("This is an automated notification from WWJMRD. For any queries, contact noreply@wwjmrdai.online")}
    `;
  } else {
    body = `
      ${h1("Galley Proof Generated 📄")}
      ${p(`Hi ${esc(authorName)},`)}
      ${p(`The galley proof for your article has been generated and is pending admin review. You will be notified once it has been approved.`)}
      ${infoBox}
      ${btn("https://wwjmrdai.lovable.app/author/articles", "View My Articles")}
      ${divider()}
      ${footer("If you have any questions, contact us at noreply@wwjmrdai.online")}
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

    console.log("AI formatting complete. Generating PDF...");

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
    }).eq("id", articleId);

    // Notify admins
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    if (admins) {
      for (const admin of admins) {
        await supabase.from("notifications").insert({
          user_id: admin.user_id,
          title: "Galley Proof Ready for Review 📝",
          message: `Galley proof for "${article.title}" (${article.reference_number}) is ready for review.`,
          type: "info",
          link: `/admin/formatting`,
        });
      }
    }

    // Notify author
    const authorProfile = article.profiles as any;
    if (authorProfile?.email) {
      await supabase.from("notifications").insert({
        user_id: article.author_id,
        title: "Galley Proof Generated 📄",
        message: `The galley proof for your article "${article.title}" has been generated and is pending admin review.`,
        type: "info",
        link: "/author/articles",
      });
    }

    // Email admin
    try {
      const adminEmailHtml = buildGalleyProofEmail({
        isAdmin: true,
        articleTitle: article.title,
        referenceNumber: article.reference_number,
        authorName: authorProfile?.full_name || "Author",
        authorEmail: authorProfile?.email || "N/A",
      });
      await supabase.functions.invoke("send-email", {
        body: {
          to: "wwjmrd@gmail.com",
          template: "custom",
          subject: `Galley Proof - ${article.reference_number}`,
          html: adminEmailHtml,
        },
      });
    } catch (emailErr) {
      console.error("Admin email notification failed:", emailErr);
    }

    // Email author
    if (authorProfile?.email) {
      try {
        const authorEmailHtml = buildGalleyProofEmail({
          isAdmin: false,
          articleTitle: article.title,
          referenceNumber: article.reference_number,
          authorName: authorProfile?.full_name || "Author",
          authorEmail: authorProfile?.email,
        });
        await supabase.functions.invoke("send-email", {
          body: {
            to: authorProfile.email,
            template: "custom",
            subject: `Galley Proof - ${article.reference_number}`,
            html: authorEmailHtml,
          },
        });
      } catch (emailErr) {
        console.error("Author email notification failed:", emailErr);
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
