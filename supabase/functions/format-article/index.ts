import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mammoth from "https://esm.sh/mammoth@1.6.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

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

// WWJMRD template format description based on the sample article
const WWJMRD_TEMPLATE_DESCRIPTION = `
You are a professional article formatting assistant for WWJMRD (World Wide Journal of Multidisciplinary Research and Development).

Your task is to reformat the given article content into the exact WWJMRD publication style. Here is the template specification:

## HEADER (every page):
- Top line: "World Wide Journal of Multidisciplinary Research and Development (Month-Year)"
- Journal citation: "WWJMRD Year; Vol(Issue): Pages"
- Website: www.wwjmrd.com
- Labels: International Journal, Peer Reviewed Journal, Refereed Journal, Indexed Journal
- Impact Factor line: "Impact Factor SJIF 2017: 5.182 2018: 5.51, (ISI) 2020-2021: 1.361"
- E-ISSN: 2454-6615

## ARTICLE STRUCTURE:
1. **Title** - Bold, centered, larger font
2. **Author Names** - Below title, with superscript numbers for affiliations
3. **Affiliations** - Institution, department, address for each author
4. **Abstract** - Section heading "Abstract", followed by the abstract text
5. **Keywords** - Section heading "Keywords", semicolon-separated keywords
6. **Numbered Sections** - Main sections numbered (1. Introduction, 2. Materials and Methods, 3. Results, 4. Discussion, 5. Conclusion)
7. **Numbered Subsections** - e.g., 2.1, 2.2, 3.1, 3.1.1
8. **Tables** - Properly formatted with captions (Table 1, Table 2, etc.)
9. **Figures** - With captions (Fig. 1, Fig. 2, etc.)
10. **References** - Numbered list, academic citation format (Author, Year. Title. Journal, Volume(Issue): Pages.)

## FOOTER (every page):
- Page numbers centered: ~ PageNum ~

## FORMATTING RULES:
- Title: Bold, 14pt equivalent
- Section headings: Bold, 12pt equivalent
- Body text: Regular, 10pt equivalent
- Single column layout
- Justified text alignment
- Line spacing: 1.15
- References in numbered list format

## REFERENCE FORMAT (Academic Guidelines):
- For journal articles: AuthorLastName Initials, Year. Title. Journal Name, Volume(Issue): Pages.
- For books: AuthorLastName Initials, Year. Title. Publisher, Location. Pages.
- For web sources: Organization, Year. Title. URL (accessed Date).

IMPORTANT INSTRUCTIONS:
1. Preserve ALL original content - do not add or remove any text
2. Only reformat the structure, headings, numbering, and layout
3. Ensure proper section numbering
4. Format references according to academic guidelines
5. Return the reformatted article as structured JSON

Also provide formatting suggestions for the admin (NOT in the article itself):
- Whether references follow proper academic citation format
- Any missing standard sections (Abstract, Keywords, Introduction, etc.)
- Suggestions for improving table/figure captions
- Any formatting inconsistencies found
`;

interface FormattedArticle {
  header: {
    month_year: string;
    volume_issue_pages: string;
  };
  title: string;
  authors: Array<{ name: string; affiliation: string }>;
  abstract: string;
  keywords: string[];
  sections: Array<{
    number: string;
    heading: string;
    content: string;
    subsections?: Array<{
      number: string;
      heading: string;
      content: string;
    }>;
  }>;
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
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  let pageNum = 1;

  const primaryBlue = [41, 98, 168] as [number, number, number];
  const darkText = [30, 30, 30] as [number, number, number];
  const grayText = [80, 80, 80] as [number, number, number];

  function checkPageBreak(requiredSpace: number) {
    if (y + requiredSpace > pageHeight - 25) {
      doc.addPage();
      y = margin;
      pageNum++;
    }
  }

  function addWrappedText(text: string, x: number, maxWidth: number, fontSize: number, color: [number, number, number], fontStyle = "normal", lineHeight = 5): number {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", fontStyle);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      checkPageBreak(lineHeight);
      doc.text(line, x, y);
      y += lineHeight;
    }
    return y;
  }

  // === PAGE HEADER ===
  function addHeader() {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...grayText);
    doc.text(`World Wide Journal of Multidisciplinary Research and Development`, pageWidth / 2, 10, { align: "center" });
    y = 18;
  }

  addHeader();

  // === JOURNAL INFO BLOCK ===
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...grayText);
  const journalInfo = [
    formatted.header?.volume_issue_pages || "",
    "www.wwjmrd.com",
    "International Journal | Peer Reviewed Journal | Refereed Journal | Indexed Journal",
    "Impact Factor SJIF 2017: 5.182 2018: 5.51, (ISI) 2020-2021: 1.361",
    "E-ISSN: 2454-6615",
  ];
  for (const line of journalInfo) {
    if (line) {
      doc.text(line, pageWidth / 2, y, { align: "center" });
      y += 4;
    }
  }
  y += 4;

  // Separator
  doc.setDrawColor(...primaryBlue);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // === TITLE ===
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  const titleLines = doc.splitTextToSize(formatted.title || article.title, contentWidth);
  for (const line of titleLines) {
    checkPageBreak(7);
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 7;
  }
  y += 4;

  // === AUTHORS ===
  if (formatted.authors?.length > 0) {
    for (const author of formatted.authors) {
      checkPageBreak(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...darkText);
      doc.text(author.name, pageWidth / 2, y, { align: "center" });
      y += 5;
      if (author.affiliation) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...grayText);
        const affLines = doc.splitTextToSize(author.affiliation, contentWidth - 20);
        for (const line of affLines) {
          doc.text(line, pageWidth / 2, y, { align: "center" });
          y += 4;
        }
      }
      y += 2;
    }
    y += 4;
  }

  // === ABSTRACT ===
  if (formatted.abstract || article.abstract) {
    checkPageBreak(15);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text("Abstract", margin, y);
    y += 6;
    addWrappedText(formatted.abstract || article.abstract || "", margin, contentWidth, 10, grayText, "normal", 5);
    y += 4;
  }

  // === KEYWORDS ===
  if (formatted.keywords?.length > 0 || article.keywords?.length > 0) {
    checkPageBreak(12);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text("Keywords", margin, y);
    y += 6;
    const kw = (formatted.keywords || article.keywords || []).join("; ");
    addWrappedText(kw, margin, contentWidth, 10, grayText, "italic", 5);
    y += 4;
  }

  // === SECTIONS ===
  if (formatted.sections?.length > 0) {
    for (const section of formatted.sections) {
      checkPageBreak(15);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...darkText);
      doc.text(`${section.number}. ${section.heading}`, margin, y);
      y += 6;

      if (section.content) {
        addWrappedText(section.content, margin, contentWidth, 10, grayText, "normal", 5);
        y += 3;
      }

      if (section.subsections?.length) {
        for (const sub of section.subsections) {
          checkPageBreak(12);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...darkText);
          doc.text(`${sub.number}. ${sub.heading}`, margin, y);
          y += 5;
          if (sub.content) {
            addWrappedText(sub.content, margin, contentWidth, 10, grayText, "normal", 5);
            y += 3;
          }
        }
      }
    }
  }

  // === REFERENCES ===
  if (formatted.references?.length > 0) {
    checkPageBreak(15);
    y += 4;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text("References", margin, y);
    y += 6;

    for (let i = 0; i < formatted.references.length; i++) {
      checkPageBreak(8);
      addWrappedText(`${i + 1}. ${formatted.references[i]}`, margin + 2, contentWidth - 4, 9, grayText, "normal", 4.5);
      y += 2;
    }
  }

  // === FOOTERS ===
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Header on every page (except first which already has it)
    if (i > 1) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...grayText);
      doc.text("World Wide Journal of Multidisciplinary Research and Development", pageWidth / 2, 10, { align: "center" });
    }
    // Page number footer
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...grayText);
    doc.text(`~ ${i} ~`, pageWidth / 2, pageHeight - 10, { align: "center" });
  }

  return doc.output("arraybuffer");
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

    // Update status to formatting
    await supabase
      .from("articles")
      .update({ formatting_status: "formatting" })
      .eq("id", articleId);

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
            content: `Please reformat this article into the WWJMRD publication style. Return the result as structured JSON.\n\n${contentToFormat}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "format_article",
              description: "Return the reformatted article in WWJMRD publication style with admin suggestions.",
              parameters: {
                type: "object",
                properties: {
                  header: {
                    type: "object",
                    properties: {
                      month_year: { type: "string", description: "e.g. December-2025" },
                      volume_issue_pages: { type: "string", description: "e.g. WWJMRD 2025; 11(12): 33-43" },
                    },
                    required: ["month_year", "volume_issue_pages"],
                  },
                  title: { type: "string" },
                  authors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        affiliation: { type: "string" },
                      },
                      required: ["name", "affiliation"],
                    },
                  },
                  abstract: { type: "string" },
                  keywords: { type: "array", items: { type: "string" } },
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        number: { type: "string" },
                        heading: { type: "string" },
                        content: { type: "string" },
                        subsections: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              number: { type: "string" },
                              heading: { type: "string" },
                              content: { type: "string" },
                            },
                            required: ["number", "heading", "content"],
                          },
                        },
                      },
                      required: ["number", "heading", "content"],
                    },
                  },
                  references: { type: "array", items: { type: "string" } },
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", description: "e.g. reference_format, missing_section, figure_caption, formatting" },
                        message: { type: "string" },
                        severity: { type: "string", enum: ["info", "warning", "improvement"] },
                      },
                      required: ["type", "message", "severity"],
                    },
                  },
                },
                required: ["title", "authors", "abstract", "keywords", "sections", "references", "suggestions"],
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
      if (aiResponse.status === 429) {
        await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
        return jsonResponse({ error: "Rate limited. Please try again later." }, 429);
      }
      if (aiResponse.status === 402) {
        await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
        return jsonResponse({ error: "AI credits exhausted. Please add funds." }, 402);
      }
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
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

    // Generate formatted PDF
    const pdfBuffer = generateFormattedPdf(article, formatted);
    const pdfBlob = new Blob([pdfBuffer], { type: "application/pdf" });
    const fileName = `formatted-${article.reference_number}-${Date.now()}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("formatted-articles")
      .upload(fileName, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      await supabase.from("articles").update({ formatting_status: "failed" }).eq("id", articleId);
      return jsonResponse({ error: "Failed to upload formatted article" }, 500);
    }

    // Update article with formatted document info
    await supabase
      .from("articles")
      .update({
        formatted_document_url: fileName,
        formatting_status: "ready_for_review",
        formatting_suggestions: formatted.suggestions || [],
      })
      .eq("id", articleId);

    // Notify admins
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

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

    // Send "Galley Proof" email notification to admin
    try {
      await supabase.functions.invoke("send-email", {
        body: {
          to: "wwjmrd@gmail.com",
          template: "custom",
          subject: `Galley Proof - ${article.reference_number}`,
          html: `<h2>Galley Proof Ready for Review</h2><p>The galley proof for article "<strong>${article.title}</strong>" (${article.reference_number}) by ${(article.profiles as any)?.full_name || "Author"} has been generated and is ready for your review.</p><p><a href="https://wwjmrdai.lovable.app/admin/formatting">Review Galley Proof</a></p>`,
        },
      });
    } catch (emailErr) {
      console.error("Admin email notification failed:", emailErr);
    }

    // Send "Galley Proof" email notification to author
    if (authorProfile?.email) {
      try {
        await supabase.functions.invoke("send-email", {
          body: {
            to: authorProfile.email,
            template: "custom",
            subject: `Galley Proof - ${article.reference_number}`,
            html: `<h2>Galley Proof Generated</h2><p>Dear ${(article.profiles as any)?.full_name || "Author"},</p><p>The galley proof for your article "<strong>${article.title}</strong>" (${article.reference_number}) has been generated and is now pending admin review.</p><p>You will be notified once it has been approved.</p><p><a href="https://wwjmrdai.lovable.app/author/articles">View My Articles</a></p>`,
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
