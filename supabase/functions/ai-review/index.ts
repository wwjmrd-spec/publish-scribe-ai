import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.6.0";
import { jsPDF } from "npm:jspdf@2.5.2";
import { aiChatCompletion, getAiGatewayConfig } from "../_shared/ai-gateway.ts";

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

async function readAiError(response: Response) {
  const text = await response.text();
  let message = text;
  let retryDelay = "";

  try {
    const parsed = JSON.parse(text);
    const error = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    message = error?.message || parsed?.message || text;
    retryDelay = error?.details?.find((detail: any) => detail?.["@type"]?.includes("RetryInfo"))?.retryDelay || "";
  } catch {
    // Keep raw provider text when it is not JSON.
  }

  return { text, message, retryDelay };
}

function providerErrorMessage(status: number, provider: string, model: string, message: string, retryDelay = "") {
  const providerName = provider === "gemini" ? "Gemini" : provider.toUpperCase();
  const retryText = retryDelay ? ` Retry after ${retryDelay}.` : "";

  if (status === 429) {
    return `${providerName} rejected model ${model} with a temporary rate limit.${retryText} You can also switch to another Gemini model in Admin > AI Settings.`;
  }

  if (status === 402) {
    return `${providerName} rejected this request for billing on model ${model}. Please check the provider billing/API access for this key.`;
  }

  return message ? `${providerName} error on ${model}: ${message}` : `${providerName} request failed on ${model}.`;
}

async function extractDocxText(supabase: any, documentUrl: string): Promise<string> {
  console.log("Downloading document from storage:", documentUrl);
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(documentUrl);

  if (downloadError || !fileData) {
    console.error("Document download error:", downloadError);
    throw new Error("Failed to download document from storage");
  }

  const arrayBuffer = await fileData.arrayBuffer();
  console.log("Document downloaded, size:", arrayBuffer.byteLength, "bytes");

  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    console.log("Text extracted, length:", result.value.length, "chars");
    return result.value;
  } catch (err) {
    console.error("Mammoth extraction error:", err);
    throw new Error("Failed to extract text from document");
  }
}

function generateReviewReportPdf(article: any, reviewData: any, authorName: string): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const now = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // Colors
  const primaryBlue = [41, 98, 168] as [number, number, number];
  const darkText = [44, 62, 80] as [number, number, number];
  const grayText = [100, 100, 100] as [number, number, number];
  const lightGray = [240, 244, 248] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const greenColor = [39, 174, 96] as [number, number, number];
  const yellowColor = [243, 156, 18] as [number, number, number];
  const redColor = [231, 76, 60] as [number, number, number];

  function getScoreColor(score: number): [number, number, number] {
    if (score >= 80) return greenColor;
    if (score >= 60) return yellowColor;
    return redColor;
  }

  function checkPageBreak(requiredSpace: number) {
    if (y + requiredSpace > pageHeight - 25) {
      doc.addPage();
      y = margin;
    }
  }

  function addWrappedText(text: string, x: number, maxWidth: number, fontSize: number, color: [number, number, number], lineHeight = 6): number {
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      checkPageBreak(lineHeight);
      doc.text(line, x, y);
      y += lineHeight;
    }
    return y;
  }

  // ===== HEADER =====
  // Top blue bar
  doc.setFillColor(...primaryBlue);
  doc.rect(0, 0, pageWidth, 4, "F");

  y = 18;
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text("Review Report", pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...grayText);
  doc.text("World Wide Journal of Multidisciplinary Research and Development", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(9);
  doc.text(`Generated on ${now}`, pageWidth / 2, y, { align: "center" });
  y += 4;

  // Separator line
  doc.setDrawColor(...primaryBlue);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // ===== ARTICLE DETAILS TABLE =====
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text("Article Details", margin, y);
  y += 6;

  const detailRows = [
    ["Article Title", article.title || "N/A"],
    ["Reference Number", article.reference_number || "N/A"],
    ["Author", authorName],
    ["Keywords", article.keywords?.join(", ") || "N/A"],
  ];

  const labelWidth = 42;
  const valueWidth = contentWidth - labelWidth;

  for (const [label, value] of detailRows) {
    const valueLines = doc.splitTextToSize(value, valueWidth - 6);
    const rowHeight = Math.max(8, valueLines.length * 5 + 4);
    checkPageBreak(rowHeight);

    // Label cell
    doc.setFillColor(...lightGray);
    doc.rect(margin, y - 4, labelWidth, rowHeight, "F");
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, y - 4, labelWidth, rowHeight, "S");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text(label, margin + 3, y);

    // Value cell
    doc.setFillColor(...white);
    doc.rect(margin + labelWidth, y - 4, valueWidth, rowHeight, "F");
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin + labelWidth, y - 4, valueWidth, rowHeight, "S");

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...grayText);
    let valueY = y;
    for (const line of valueLines) {
      doc.text(line, margin + labelWidth + 3, valueY);
      valueY += 5;
    }

    y += rowHeight;
  }

  y += 10;

  // ===== SCORES SECTION =====
  checkPageBreak(40);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text("Review Scores", margin, y);
  y += 8;

  const scores = [
    { label: "Plagiarism", value: reviewData.plagiarismScore },
    { label: "Grammar", value: reviewData.grammarScore },
    { label: "Content", value: reviewData.contentScore },
    { label: "Overall", value: reviewData.overallScore },
  ];

  const boxWidth = (contentWidth - 15) / 4;
  const boxHeight = 28;

  scores.forEach((score, i) => {
    const boxX = margin + i * (boxWidth + 5);
    const color = getScoreColor(score.value);

    // Score box background
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(boxX, y, boxWidth, boxHeight, 3, 3, "F");

    // Score label
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 255, 255);
    doc.text(score.label, boxX + boxWidth / 2, y + 8, { align: "center" });

    // Score value
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`${score.value}%`, boxX + boxWidth / 2, y + 21, { align: "center" });
  });

  y += boxHeight + 10;

  // ===== RECOMMENDATION =====
  const recLabel = (reviewData.detailedFeedback?.recommendation || "N/A").replace(/_/g, " ");
  const recColor = recLabel === "accept" ? greenColor
    : recLabel.includes("minor") ? yellowColor
    : recLabel.includes("major") ? [230, 126, 34] as [number, number, number]
    : redColor;

  checkPageBreak(16);
  doc.setFillColor(recColor[0], recColor[1], recColor[2]);
  doc.roundedRect(margin, y, contentWidth, 12, 3, 3, "F");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`Recommendation: ${recLabel.toUpperCase()}`, pageWidth / 2, y + 8, { align: "center" });
  y += 20;

  // ===== SUMMARY =====
  if (reviewData.summary) {
    checkPageBreak(20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text("Summary", margin, y);
    y += 6;

    doc.setFillColor(...lightGray);
    const summaryLines = doc.splitTextToSize(reviewData.summary, contentWidth - 10);
    const summaryHeight = summaryLines.length * 5 + 8;
    checkPageBreak(summaryHeight);
    doc.roundedRect(margin, y - 3, contentWidth, summaryHeight, 2, 2, "F");

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...grayText);
    for (const line of summaryLines) {
      doc.text(line, margin + 5, y + 2);
      y += 5;
    }
    y += 10;
  }

  // ===== DETAILED FEEDBACK SECTIONS =====
  const feedback = reviewData.detailedFeedback;

  function addSection(title: string, dotColor: [number, number, number], content: {
    assessment?: string;
    issues?: string[];
    suggestions?: string[];
    strengths?: string[];
    weaknesses?: string[];
  }) {
    if (!content) return;

    checkPageBreak(20);

    // Section title with colored dot
    doc.setFillColor(...dotColor);
    doc.circle(margin + 3, y - 1.5, 2.5, "F");

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text(title, margin + 9, y);
    y += 2;

    // Thin separator
    doc.setDrawColor(...dotColor);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Assessment
    if (content.assessment) {
      addWrappedText(content.assessment, margin + 2, contentWidth - 4, 9, grayText, 5);
      y += 3;
    }

    // Strengths
    if (content.strengths?.length) {
      checkPageBreak(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...greenColor);
      doc.text("Strengths:", margin + 2, y);
      y += 5;
      for (const item of content.strengths) {
        checkPageBreak(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...grayText);
        const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 8);
        for (const line of lines) {
          doc.text(line, margin + 5, y);
          y += 5;
        }
      }
      y += 2;
    }

    // Weaknesses
    if (content.weaknesses?.length) {
      checkPageBreak(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...redColor);
      doc.text("Weaknesses:", margin + 2, y);
      y += 5;
      for (const item of content.weaknesses) {
        checkPageBreak(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...grayText);
        const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 8);
        for (const line of lines) {
          doc.text(line, margin + 5, y);
          y += 5;
        }
      }
      y += 2;
    }

    // Issues
    if (content.issues?.length) {
      checkPageBreak(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(230, 126, 34);
      doc.text("Issues Found:", margin + 2, y);
      y += 5;
      for (const item of content.issues) {
        checkPageBreak(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...grayText);
        const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 8);
        for (const line of lines) {
          doc.text(line, margin + 5, y);
          y += 5;
        }
      }
      y += 2;
    }

    // Suggestions
    if (content.suggestions?.length) {
      checkPageBreak(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryBlue);
      doc.text("Suggestions:", margin + 2, y);
      y += 5;
      for (const item of content.suggestions) {
        checkPageBreak(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...grayText);
        const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 8);
        for (const line of lines) {
          doc.text(line, margin + 5, y);
          y += 5;
        }
      }
      y += 2;
    }

    y += 5;
  }

  if (feedback) {
    if (feedback.plagiarism) {
      addSection("Plagiarism Assessment", [52, 152, 219] as [number, number, number], feedback.plagiarism);
    }
    if (feedback.grammar) {
      addSection("Grammar & Structure", yellowColor, feedback.grammar);
    }
    if (feedback.content) {
      addSection("Content Quality", greenColor, feedback.content);
    }
  }

  // ===== FOOTER =====
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Bottom border
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...grayText);
    doc.text(
      "This report was generated as a supplementary review tool.",
      pageWidth / 2, pageHeight - 10, { align: "center" }
    );
    doc.text(
      "WWJMRD • support@wwjmrd.com • www.wwjmrd.com",
      pageWidth / 2, pageHeight - 6, { align: "center" }
    );

    // Page number
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  return doc.output("arraybuffer");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "No authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiGateway = await getAiGatewayConfig();

    // Auth: allow service role key (for internal cron calls) or verify JWT for admin
    const token = authHeader.replace("Bearer ", "").trim();
    const isServiceRole = token === supabaseServiceKey;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!isServiceRole) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) return jsonResponse({ error: "Unauthorized" }, 401);

      const userId = claimsData.claims.sub as string;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (roleData?.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403);
    }

    const { articleId } = await req.json();
    if (!articleId) return jsonResponse({ error: "Article ID required" }, 400);

    // Fetch article with author info
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*, profiles:author_id (full_name, email)")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      console.error("Article fetch error:", articleError);
      return jsonResponse({ error: "Article not found" }, 404);
    }

    // Extract text from the best available document version
    let documentText = "";
    
    // Try multiple document sources in priority order
    const docSources = [
      { url: article.galley_proof_revision_url, bucket: "documents", label: "galley proof revision" },
      { url: article.formatted_document_url, bucket: "formatted-articles", label: "formatted document" },
      { url: article.document_url, bucket: "documents", label: "original document" },
    ].filter(s => s.url);

    for (const source of docSources) {
      try {
        console.log(`Trying ${source.label} from bucket '${source.bucket}':`, source.url);
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(source.bucket)
          .download(source.url);

        if (downloadError || !fileData) {
          console.error(`Download failed for ${source.label}:`, downloadError?.message);
          continue;
        }

        const arrayBuffer = await fileData.arrayBuffer();
        console.log(`${source.label} downloaded, size:`, arrayBuffer.byteLength, "bytes");
        
        if (arrayBuffer.byteLength < 100) {
          console.error(`${source.label} file too small (${arrayBuffer.byteLength} bytes), skipping`);
          continue;
        }

        // mammoth needs a Buffer, not raw ArrayBuffer
        const buffer = new Uint8Array(arrayBuffer);
        let text = "";
        const isLegacyDoc = /\.doc$/i.test(source.url as string);
        if (!isLegacyDoc) {
          try {
            const result = await mammoth.extractRawText({ buffer: buffer as any });
            text = result.value || "";
          } catch (mErr) {
            console.error(`Mammoth failed for ${source.label}:`, mErr);
          }
        }
        // Fallback for legacy binary .doc (OLE) files mammoth cannot parse
        if (text.trim().length <= 50) {
          const legacy = extractLegacyDocText(buffer);
          if (legacy.trim().length > text.trim().length) text = legacy;
        }
        console.log(`Text extracted from ${source.label}, length:`, text.length, "chars");

        if (text.trim().length > 50) {
          documentText = text;
          console.log(`Using ${source.label} for review`);
          break;
        } else {
          console.error(`${source.label} text too short (${text.trim().length} chars), trying next`);
        }

      } catch (err) {
        console.error(`Failed to extract ${source.label}:`, err);
        continue;
      }
    }

    if (!documentText) {
      console.error("ALL document sources failed. Available URLs:", {
        document_url: article.document_url,
        formatted_document_url: article.formatted_document_url,
        galley_proof_revision_url: article.galley_proof_revision_url,
      });
    }

    // Build content for review - require document text for a proper review
    if (!documentText && article.document_url) {
      return jsonResponse({ 
        error: "Could not extract text from the article document. Please ensure the file is a valid .docx file and try again." 
      }, 400);
    }

    const contentToReview = documentText
      ? `Title: ${article.title}\n\nAbstract: ${article.abstract || "No abstract provided"}\n\nKeywords: ${article.keywords?.join(", ") || "No keywords provided"}\n\n--- Full Document Content ---\n${documentText.substring(0, 30000)}`
      : `Title: ${article.title}\n\nAbstract: ${article.abstract || "No abstract provided"}\n\nKeywords: ${article.keywords?.join(", ") || "No keywords provided"}`;

    const reviewSource = documentText ? "full_document" : "metadata_only";
    console.log("Sending article for AI review:", article.reference_number, "Source:", reviewSource, "Content length:", contentToReview.length);

    // Call configured AI provider for review
    const aiResponse = await aiChatCompletion(aiGateway, {
      messages: [
          {
            role: "system",
            content: `You are a senior peer reviewer for an indexed multidisciplinary academic journal (WWJMRD). Apply COPE (Committee on Publication Ethics), ICMJE and WAME guidelines strictly. Your review must be evidence-based, reproducible, and conservative — do not inflate scores.

Evaluate the article on FOUR dimensions, each 0–100. Be strict; most genuine submissions score 55–80. Only award 90+ when the work is genuinely outstanding with no significant issues.

SCORING RUBRIC (anchor scores to specific, observable evidence in the text):

1. PLAGIARISM & ORIGINALITY (plagiarismScore — higher = MORE original / cleaner)
   • 90–100: Highly original phrasing; no formulaic or templated sections; references properly paraphrased; ideas clearly the authors'.
   • 70–89: Mostly original; minor over-reliance on common phrasings; no obvious copy-paste indicators.
   • 50–69: Noticeable boilerplate, repeated stock phrases, weak paraphrasing, or unattributed common knowledge framed as novel.
   • 30–49: Multiple passages read like patchwriting / mosaic plagiarism; possible reuse from prior literature without quotation.
   • 0–29: Clear signs of verbatim reuse, AI-generated filler, self-plagiarism, or fabricated/duplicate content.
   Flag (in suggestions): possible duplicate publication, salami-slicing, ghost/guest authorship signals, undisclosed AI-generation, missing citations for specific claims.

2. GRAMMAR, STRUCTURE & STYLE (grammarScore)
   • Judge: sentence-level grammar, academic tone, IMRaD/section structure, abstract quality (background/methods/results/conclusions), keyword relevance, figure/table referencing, citation style consistency, reference completeness.
   • Penalize: run-ons, tense shifts, undefined acronyms, missing sections, broken numbering, inconsistent citation style, vague titles.

3. CONTENT QUALITY & SCHOLARLY MERIT (contentScore)
   • Judge: clarity of research question, novelty, methodological soundness, validity of data/analysis, logical reasoning, depth of discussion, contribution to field, ethical declarations (consent, IRB, conflicts of interest, data availability, funding).
   • Penalize: unsupported claims, missing methodology, absent limitations, no statistical justification (where applicable), missing ethics statements, conclusions not grounded in results, predatory citation patterns.

4. OVERALL SCORE — compute as a WEIGHTED average and round to nearest integer:
   overallScore = round(0.20*plagiarismScore + 0.25*grammarScore + 0.55*contentScore)
   Do NOT pick a number independently; it MUST match this formula.

RECOMMENDATION MAPPING (use overallScore + ethical red flags):
   • overall ≥ 80 AND no ethical red flags → "accept"
   • 70–79 → "minor_revisions"
   • 55–69 → "major_revisions"
   • < 55 OR any serious ethical violation (plagiarism, fabrication, undisclosed COI, missing IRB for human/animal research) → "reject"

OUTPUT — return ONLY a valid JSON object, no markdown fences, no commentary. Use this EXACT structure:
{
  "plagiarismScore": number,
  "grammarScore": number,
  "contentScore": number,
  "overallScore": number,
  "summary": "2–3 sentence overall assessment grounded in the rubric above",
  "detailedFeedback": {
    "plagiarism": {
      "assessment": "Concrete observations from the text (cite phrases or sections, e.g. 'Introduction paragraph 2 reads as boilerplate').",
      "suggestions": ["specific, actionable items"]
    },
    "grammar": {
      "assessment": "Specific grammar / structural observations.",
      "issues": ["concrete issues with section/line context"],
      "suggestions": ["specific fixes"]
    },
    "content": {
      "assessment": "Methodological and scholarly assessment with evidence.",
      "strengths": ["specific strengths"],
      "weaknesses": ["specific weaknesses, including missing ethics/COI/IRB/data statements when applicable"],
      "suggestions": ["specific, actionable improvements"]
    },
    "recommendation": "accept | minor_revisions | major_revisions | reject"
  }
}

Rules: Base every score on evidence visible in the supplied text. Never invent quotations. If the document is metadata-only, cap all scores at 60 and state this limitation in the summary. Verify the overallScore formula before returning.`,
          },
          {
            role: "user",
            content: `Please review the following academic article submission:\n\n${contentToReview}`,
          },
        ],
      temperature: 0.1,
      top_p: 0.9,
    });

    if (!aiResponse.ok) {
      const aiError = await readAiError(aiResponse);
      console.error("AI Gateway error:", aiResponse.status, aiGateway.provider, aiGateway.model, aiError.text);
      if (aiResponse.status === 429) {
        return jsonResponse({
          error: "AI_RATE_LIMITED",
          message: providerErrorMessage(aiResponse.status, aiGateway.provider, aiGateway.model, aiError.message, aiError.retryDelay),
          retryable: true,
          provider: aiGateway.provider,
          model: aiGateway.model,
        }, 200);
      }
      if (aiResponse.status === 402) {
        return jsonResponse({
          error: "AI_BILLING_ERROR",
          message: providerErrorMessage(aiResponse.status, aiGateway.provider, aiGateway.model, aiError.message),
          retryable: false,
          provider: aiGateway.provider,
          model: aiGateway.model,
        }, 200);
      }
      return jsonResponse({ error: "AI review failed", message: providerErrorMessage(aiResponse.status, aiGateway.provider, aiGateway.model, aiError.message) }, 500);
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content;
    if (!responseContent) return jsonResponse({ error: "Empty AI response" }, 500);

    // Parse AI response
    let reviewData;
    try {
      let jsonStr = responseContent;
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\n?/g, "");
      }
      reviewData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseContent);
      return jsonResponse({ error: "Failed to parse AI response" }, 500);
    }

    // Normalize & enforce the weighted overall-score formula so the DB and UI always agree.
    const clamp = (n: any) => {
      const v = Math.round(Number(n));
      if (!Number.isFinite(v)) return 0;
      return Math.max(0, Math.min(100, v));
    };
    reviewData.plagiarismScore = clamp(reviewData.plagiarismScore);
    reviewData.grammarScore = clamp(reviewData.grammarScore);
    reviewData.contentScore = clamp(reviewData.contentScore);
    const computedOverall = Math.round(
      0.20 * reviewData.plagiarismScore +
      0.25 * reviewData.grammarScore +
      0.55 * reviewData.contentScore,
    );
    reviewData.overallScore = computedOverall;
    // If metadata-only review, cap every score at 60 per the rubric.
    if (!documentText) {
      reviewData.plagiarismScore = Math.min(60, reviewData.plagiarismScore);
      reviewData.grammarScore = Math.min(60, reviewData.grammarScore);
      reviewData.contentScore = Math.min(60, reviewData.contentScore);
      reviewData.overallScore = Math.min(60, reviewData.overallScore);
    }

    // Generate PDF review report
    const authorName = (article.profiles as any)?.full_name || "Unknown Author";
    console.log("Generating PDF report for:", article.reference_number);
    const pdfBuffer = generateReviewReportPdf(article, reviewData, authorName);

    // Upload PDF report to storage
    const reportFileName = `review-${article.reference_number}-${Date.now()}.pdf`;
    const { error: reportUploadError } = await supabase.storage
      .from("review-reports")
      .upload(reportFileName, new Blob([pdfBuffer], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (reportUploadError) {
      console.error("Report upload error:", reportUploadError);
    }

    // Store review in database (NOT yet sent to author — admin must approve first)
    const { data: review, error: insertError } = await supabase
      .from("article_reviews")
      .insert({
        article_id: articleId,
        review_type: "ai",
        plagiarism_score: reviewData.plagiarismScore,
        grammar_score: reviewData.grammarScore,
        content_score: reviewData.contentScore,
        overall_score: reviewData.overallScore,
        summary: reviewData.summary,
        detailed_feedback: reviewData.detailedFeedback,
        reviewed_by: null,
        approved: false,
        report_url: reportUploadError ? null : reportFileName,
        scores_edited: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: "Failed to save review" }, 500);
    }

    console.log(`AI review completed for article ${articleId}, report: ${reportFileName} (pending admin approval)`);

    return jsonResponse({
      success: true,
      review,
      reviewReportUrl: reportFileName,
      documentReviewed: !!documentText,
      pendingApproval: true,
    });
  } catch (error) {
    console.error("AI review error:", error);
    return jsonResponse(
      { error: "An error occurred while processing the review. Please try again." },
      500
    );
  }
});
