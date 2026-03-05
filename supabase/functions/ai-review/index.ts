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
      "WWJMRD • wwjmrd@gmail.com • www.wwjmrd.com",
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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    // Auth: verify JWT using anon key client + getClaims
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

    // Extract text from the uploaded .docx document
    let documentText = "";
    if (article.document_url) {
      try {
        documentText = await extractDocxText(supabase, article.document_url);
      } catch (err) {
        console.error("Document extraction failed:", err);
      }
    }

    // Build content for review
    const contentToReview = documentText
      ? `Title: ${article.title}\n\nAbstract: ${article.abstract || "No abstract provided"}\n\nKeywords: ${article.keywords?.join(", ") || "No keywords provided"}\n\n--- Full Document Content ---\n${documentText.substring(0, 30000)}`
      : `Title: ${article.title}\n\nAbstract: ${article.abstract || "No abstract provided"}\n\nKeywords: ${article.keywords?.join(", ") || "No keywords provided"}`;

    console.log("Sending article for AI review:", article.reference_number, "Content length:", contentToReview.length);

    // Call Lovable AI Gateway for review
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert academic article reviewer. Analyze the submitted article (including its full document content if provided) and provide a comprehensive review covering:

1. **Plagiarism Assessment** (0-100 score): Analyze writing patterns, phrase originality, and potential concerns about originality. Note: You cannot check actual databases, but can assess writing quality indicators.

2. **Grammar & Structure** (0-100 score): Evaluate writing quality, sentence structure, academic tone, proper formatting, and clarity.

3. **Content Quality** (0-100 score): Assess relevance, depth of analysis, methodology soundness (if applicable), contribution to the field, and scholarly merit.

4. **Overall Score** (0-100): Weighted average of above scores.

Provide your response as a valid JSON object with this exact structure:
{
  "plagiarismScore": number,
  "grammarScore": number,
  "contentScore": number,
  "overallScore": number,
  "summary": "Brief 2-3 sentence overall assessment",
  "detailedFeedback": {
    "plagiarism": {
      "assessment": "string describing plagiarism concerns or lack thereof",
      "suggestions": ["array of suggestions"]
    },
    "grammar": {
      "assessment": "string describing grammar quality",
      "issues": ["array of specific issues found"],
      "suggestions": ["array of suggestions"]
    },
    "content": {
      "assessment": "string describing content quality",
      "strengths": ["array of strengths"],
      "weaknesses": ["array of weaknesses"],
      "suggestions": ["array of suggestions"]
    },
    "recommendation": "accept | minor_revisions | major_revisions | reject"
  }
}`,
          },
          {
            role: "user",
            content: `Please review the following academic article submission:\n\n${contentToReview}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      if (aiResponse.status === 429) return jsonResponse({ error: "Rate limit exceeded. Please try again later." }, 429);
      if (aiResponse.status === 402) return jsonResponse({ error: "AI credits exhausted. Please add funds." }, 402);
      return jsonResponse({ error: "AI review failed" }, 500);
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

    // Update article with review report URL path
    if (!reportUploadError) {
      await supabase
        .from("articles")
        .update({ review_report_url: reportFileName })
        .eq("id", articleId);
    }

    // Store review in database
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
        reviewed_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: "Failed to save review" }, 500);
    }

    console.log(`AI review completed for article ${articleId}, report: ${reportFileName}`);

    // Send email notification to author about review report
    try {
      const authorProfile = article.profiles as any;
      if (authorProfile?.email) {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            to: authorProfile.email,
            template: "review-report-ready",
            data: {
              authorName: authorProfile.full_name || "Author",
              articleTitle: article.title,
              referenceNumber: article.reference_number,
              overallScore: reviewData.overallScore,
              recommendation: (reviewData.detailedFeedback?.recommendation || "N/A").replace(/_/g, " "),
            },
          }),
        });
        console.log("Review report email sent to:", authorProfile.email);
      }
    } catch (emailError) {
      console.error("Failed to send review report email:", emailError);
    }

    return jsonResponse({
      success: true,
      review,
      reviewReportUrl: reportFileName,
      documentReviewed: !!documentText,
    });
  } catch (error) {
    console.error("AI review error:", error);
    return jsonResponse(
      { error: "An error occurred while processing the review. Please try again." },
      500
    );
  }
});
