import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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

// Re-implement the same PDF generator as ai-review (kept consistent)
function generateReviewReportPdf(article: any, reviewData: any, authorName: string): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const now = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const primaryBlue = [41, 98, 168] as [number, number, number];
  const darkText = [44, 62, 80] as [number, number, number];
  const grayText = [100, 100, 100] as [number, number, number];
  const lightGray = [240, 244, 248] as [number, number, number];
  const greenColor = [39, 174, 96] as [number, number, number];
  const yellowColor = [243, 156, 18] as [number, number, number];
  const redColor = [231, 76, 60] as [number, number, number];

  function getScoreColor(score: number): [number, number, number] {
    if (score >= 80) return greenColor;
    if (score >= 60) return yellowColor;
    return redColor;
  }
  function checkPageBreak(req: number) {
    if (y + req > pageHeight - 25) { doc.addPage(); y = margin; }
  }
  function addWrapped(text: string, x: number, maxW: number, fs: number, color: [number, number, number], lh = 6) {
    doc.setFontSize(fs); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxW);
    for (const ln of lines) { checkPageBreak(lh); doc.text(ln, x, y); y += lh; }
  }

  doc.setFillColor(...primaryBlue); doc.rect(0, 0, pageWidth, 4, "F");
  y = 18;
  doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.setTextColor(...darkText);
  doc.text("Review Report", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(...grayText);
  doc.text("World Wide Journal of Multidisciplinary Research and Development", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(9); doc.text(`Generated on ${now}`, pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.setDrawColor(...primaryBlue); doc.setLineWidth(0.8); doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...darkText);
  doc.text("Article Details", margin, y); y += 6;

  const detailRows = [
    ["Article Title", article.title || "N/A"],
    ["Reference Number", article.reference_number || "N/A"],
    ["Author", authorName],
    ["Keywords", article.keywords?.join(", ") || "N/A"],
  ];
  const labelW = 42;
  const valueW = contentWidth - labelW;
  for (const [label, value] of detailRows) {
    const valueLines = doc.splitTextToSize(value, valueW - 6);
    const rowH = Math.max(8, valueLines.length * 5 + 4);
    checkPageBreak(rowH);
    doc.setFillColor(...lightGray); doc.rect(margin, y - 4, labelW, rowH, "F");
    doc.setDrawColor(220, 220, 220); doc.rect(margin, y - 4, labelW, rowH, "S");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...darkText);
    doc.text(label, margin + 3, y);
    doc.setFillColor(255, 255, 255); doc.rect(margin + labelW, y - 4, valueW, rowH, "F");
    doc.setDrawColor(220, 220, 220); doc.rect(margin + labelW, y - 4, valueW, rowH, "S");
    doc.setFont("helvetica", "normal"); doc.setTextColor(...grayText);
    let vy = y;
    for (const ln of valueLines) { doc.text(ln, margin + labelW + 3, vy); vy += 5; }
    y += rowH;
  }
  y += 10;

  checkPageBreak(40);
  doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...darkText);
  doc.text("Review Scores", margin, y); y += 8;

  const scores = [
    { label: "Plagiarism", value: reviewData.plagiarismScore },
    { label: "Grammar", value: reviewData.grammarScore },
    { label: "Content", value: reviewData.contentScore },
    { label: "Overall", value: reviewData.overallScore },
  ];
  const boxW = (contentWidth - 15) / 4;
  const boxH = 28;
  scores.forEach((s, i) => {
    const x = margin + i * (boxW + 5);
    const color = getScoreColor(s.value);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(x, y, boxW, boxH, 3, 3, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(255, 255, 255);
    doc.text(s.label, x + boxW / 2, y + 8, { align: "center" });
    doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.text(`${s.value}%`, x + boxW / 2, y + 21, { align: "center" });
  });
  y += boxH + 10;

  const recLabel = (reviewData.detailedFeedback?.recommendation || "N/A").replace(/_/g, " ");
  const recColor = recLabel === "accept" ? greenColor
    : recLabel.includes("minor") ? yellowColor
    : recLabel.includes("major") ? [230, 126, 34] as [number, number, number]
    : redColor;
  checkPageBreak(16);
  doc.setFillColor(recColor[0], recColor[1], recColor[2]);
  doc.roundedRect(margin, y, contentWidth, 12, 3, 3, "F");
  doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text(`Recommendation: ${recLabel.toUpperCase()}`, pageWidth / 2, y + 8, { align: "center" });
  y += 20;

  if (reviewData.summary) {
    checkPageBreak(20);
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...darkText);
    doc.text("Summary", margin, y); y += 6;
    const lines = doc.splitTextToSize(reviewData.summary, contentWidth - 10);
    const h = lines.length * 5 + 8;
    checkPageBreak(h);
    doc.setFillColor(...lightGray);
    doc.roundedRect(margin, y - 3, contentWidth, h, 2, 2, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...grayText);
    for (const ln of lines) { doc.text(ln, margin + 5, y + 2); y += 5; }
    y += 10;
  }

  const fb = reviewData.detailedFeedback;
  function addSection(title: string, dot: [number, number, number], c: any) {
    if (!c) return;
    checkPageBreak(20);
    doc.setFillColor(...dot); doc.circle(margin + 3, y - 1.5, 2.5, "F");
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...darkText);
    doc.text(title, margin + 9, y); y += 2;
    doc.setDrawColor(...dot); doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y); y += 6;
    if (c.assessment) { addWrapped(c.assessment, margin + 2, contentWidth - 4, 9, grayText, 5); y += 3; }
    const grp = (label: string, items: string[] | undefined, color: [number, number, number]) => {
      if (!items?.length) return;
      checkPageBreak(10);
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...color);
      doc.text(label, margin + 2, y); y += 5;
      for (const it of items) {
        checkPageBreak(6);
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...grayText);
        const ls = doc.splitTextToSize(`• ${it}`, contentWidth - 8);
        for (const l of ls) { doc.text(l, margin + 5, y); y += 5; }
      }
      y += 2;
    };
    grp("Strengths:", c.strengths, greenColor);
    grp("Weaknesses:", c.weaknesses, redColor);
    grp("Issues Found:", c.issues, [230, 126, 34]);
    grp("Suggestions:", c.suggestions, primaryBlue);
    y += 5;
  }
  if (fb) {
    if (fb.plagiarism) addSection("Plagiarism Assessment", [52, 152, 219], fb.plagiarism);
    if (fb.grammar) addSection("Grammar & Structure", yellowColor, fb.grammar);
    if (fb.content) addSection("Content Quality", greenColor, fb.content);
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(...grayText);
    doc.text("This report was generated as a supplementary review tool.", pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.text("WWJMRD • support@wwjmrd.com • www.wwjmrd.com", pageWidth / 2, pageHeight - 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${total}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  return doc.output("arraybuffer");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "No authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "").trim();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return jsonResponse({ error: "Unauthorized" }, 401);

    const userId = claimsData.claims.sub as string;
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).single();
    if (roleData?.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403);

    const body = await req.json();
    const { reviewId, action, scores } = body as {
      reviewId: string;
      action: "update_scores" | "approve";
      scores?: {
        plagiarism_score?: number;
        grammar_score?: number;
        content_score?: number;
        overall_score?: number;
      };
    };
    if (!reviewId || !action) return jsonResponse({ error: "reviewId and action required" }, 400);

    // Fetch review + article
    const { data: review, error: reviewErr } = await supabase
      .from("article_reviews").select("*").eq("id", reviewId).single();
    if (reviewErr || !review) return jsonResponse({ error: "Review not found" }, 404);

    const { data: article, error: artErr } = await supabase
      .from("articles").select("*, profiles:author_id (full_name, email)").eq("id", review.article_id).single();
    if (artErr || !article) return jsonResponse({ error: "Article not found" }, 404);

    if (action === "update_scores") {
      // Validate
      const clamp = (n: any) => {
        const x = Number(n);
        if (!Number.isFinite(x)) return null;
        return Math.max(70, Math.min(100, Math.round(x)));
      };
      const plag = scores?.plagiarism_score != null ? clamp(scores.plagiarism_score) : review.plagiarism_score;
      const gram = scores?.grammar_score != null ? clamp(scores.grammar_score) : review.grammar_score;
      const cont = scores?.content_score != null ? clamp(scores.content_score) : review.content_score;
      const over = scores?.overall_score != null ? clamp(scores.overall_score) : review.overall_score;
      if ([plag, gram, cont, over].some((v) => v === null)) {
        return jsonResponse({ error: "Invalid score values" }, 400);
      }

      // Regenerate PDF with new scores
      const reviewData = {
        plagiarismScore: plag,
        grammarScore: gram,
        contentScore: cont,
        overallScore: over,
        summary: review.summary,
        detailedFeedback: review.detailed_feedback,
      };
      const authorName = (article.profiles as any)?.full_name || "Unknown Author";
      const pdfBuffer = generateReviewReportPdf(article, reviewData, authorName);
      const reportFileName = `review-${article.reference_number}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("review-reports")
        .upload(reportFileName, new Blob([pdfBuffer], { type: "application/pdf" }), {
          contentType: "application/pdf", upsert: true,
        });
      if (upErr) {
        console.error("Re-upload error:", upErr);
        return jsonResponse({ error: "Failed to regenerate report" }, 500);
      }

      const { error: updErr } = await supabase
        .from("article_reviews")
        .update({
          plagiarism_score: plag,
          grammar_score: gram,
          content_score: cont,
          overall_score: over,
          report_url: reportFileName,
          scores_edited: true,
        })
        .eq("id", reviewId);
      if (updErr) return jsonResponse({ error: "Failed to update review" }, 500);

      // If this review was already approved (author already has access),
      // update the article's public report URL so the author sees the new
      // report immediately without another approval step.
      if (review.approved) {
        await supabase
          .from("articles")
          .update({ review_report_url: reportFileName })
          .eq("id", review.article_id);
      }

      return jsonResponse({ success: true, reportUrl: reportFileName });
    }

    if (action === "approve") {
      if (!review.report_url) {
        return jsonResponse({ error: "No report to approve. Re-analyze first." }, 400);
      }

      const nextStatus = article.status === "revised_submitted"
        ? "revised_review_generated"
        : "ai_review_generated";

      // Publish report to author + advance status
      const { error: artUpd } = await supabase
        .from("articles")
        .update({ review_report_url: review.report_url, status: nextStatus })
        .eq("id", review.article_id);
      if (artUpd) {
        console.error("Article update error:", artUpd);
        return jsonResponse({ error: "Failed to publish report" }, 500);
      }

      await supabase
        .from("article_reviews")
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: userId,
        })
        .eq("id", reviewId);

      // Send email to author
      try {
        const author = article.profiles as any;
        if (author?.email) {
          const overall = review.overall_score || 0;
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              to: author.email,
              template: "review-report-ready",
              data: {
                authorName: author.full_name || "Author",
                articleTitle: article.title,
                referenceNumber: article.reference_number,
                overallScore: overall,
                recommendation: ((review.detailed_feedback as any)?.recommendation || "N/A").replace(/_/g, " "),
                isLowScore: overall < 90,
              },
            }),
          });
        }
      } catch (e) {
        console.error("Email send failed:", e);
      }

      return jsonResponse({ success: true, approved: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("approve-review error:", e);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
