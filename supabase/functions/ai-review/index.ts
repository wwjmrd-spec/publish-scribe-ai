import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mammoth from "https://esm.sh/mammoth@1.6.0";

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

function generateReviewReportHtml(article: any, reviewData: any, authorName: string): string {
  const now = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const recLabel = (reviewData.detailedFeedback?.recommendation || "").replace(/_/g, " ");
  const recColor = recLabel === "accept" ? "#27ae60"
    : recLabel.includes("minor") ? "#f39c12"
    : recLabel.includes("major") ? "#e67e22"
    : "#e74c3c";

  const listItems = (arr: string[] | undefined) =>
    arr?.map((s: string) => `<li>${s}</li>`).join("") || "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Open Sans', sans-serif; background: #f5f7fa; padding: 30px; }
  .report { max-width: 800px; margin: auto; background: white; border: 2px solid #2c3e50; padding: 40px; }
  .header { text-align: center; border-bottom: 2px solid #3498db; padding-bottom: 20px; margin-bottom: 25px; }
  .header h1 { font-size: 22px; color: #2c3e50; }
  .header .journal { font-size: 13px; color: #666; margin-top: 5px; }
  .header .date { font-size: 12px; color: #999; margin-top: 5px; }
  .meta { margin-bottom: 25px; }
  .meta table { width: 100%; border-collapse: collapse; }
  .meta td { padding: 8px 12px; border: 1px solid #ddd; font-size: 13px; }
  .meta td:first-child { font-weight: 600; background: #f8f9fa; width: 30%; }
  .scores { display: flex; gap: 15px; margin: 25px 0; flex-wrap: wrap; }
  .score-box { flex: 1; min-width: 120px; text-align: center; padding: 15px; border-radius: 8px; border: 1px solid #ddd; }
  .score-box .label { font-size: 12px; color: #666; margin-bottom: 5px; }
  .score-box .value { font-size: 28px; font-weight: 700; }
  .score-green .value { color: #27ae60; }
  .score-yellow .value { color: #f39c12; }
  .score-red .value { color: #e74c3c; }
  .recommendation { text-align: center; margin: 20px 0; padding: 12px; border-radius: 8px; font-weight: 700; font-size: 16px; text-transform: uppercase; }
  .section { margin: 20px 0; }
  .section h3 { font-size: 15px; color: #2c3e50; border-left: 4px solid #3498db; padding-left: 10px; margin-bottom: 10px; }
  .section p, .section li { font-size: 13px; color: #444; line-height: 1.7; }
  .section ul { padding-left: 20px; }
  .section .sub { font-weight: 600; margin: 8px 0 4px; color: #555; font-size: 13px; }
  .summary { background: #f0f4f8; padding: 15px; border-radius: 8px; font-size: 13px; color: #333; line-height: 1.7; margin: 20px 0; }
  .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 11px; color: #999; }
</style></head><body>
<div class="report">
  <div class="header">
    <h1>AI Review Report</h1>
    <div class="journal">World Wide Journal of Multidisciplinary Research and Development</div>
    <div class="date">Generated on ${now}</div>
  </div>

  <div class="meta">
    <table>
      <tr><td>Article Title</td><td>${article.title}</td></tr>
      <tr><td>Reference Number</td><td>${article.reference_number}</td></tr>
      <tr><td>Author</td><td>${authorName}</td></tr>
      <tr><td>Keywords</td><td>${article.keywords?.join(", ") || "N/A"}</td></tr>
    </table>
  </div>

  <div class="scores">
    <div class="score-box ${reviewData.plagiarismScore >= 80 ? "score-green" : reviewData.plagiarismScore >= 60 ? "score-yellow" : "score-red"}">
      <div class="label">Plagiarism</div><div class="value">${reviewData.plagiarismScore}%</div>
    </div>
    <div class="score-box ${reviewData.grammarScore >= 80 ? "score-green" : reviewData.grammarScore >= 60 ? "score-yellow" : "score-red"}">
      <div class="label">Grammar</div><div class="value">${reviewData.grammarScore}%</div>
    </div>
    <div class="score-box ${reviewData.contentScore >= 80 ? "score-green" : reviewData.contentScore >= 60 ? "score-yellow" : "score-red"}">
      <div class="label">Content</div><div class="value">${reviewData.contentScore}%</div>
    </div>
    <div class="score-box ${reviewData.overallScore >= 80 ? "score-green" : reviewData.overallScore >= 60 ? "score-yellow" : "score-red"}">
      <div class="label">Overall</div><div class="value">${reviewData.overallScore}%</div>
    </div>
  </div>

  <div class="recommendation" style="background: ${recColor}22; color: ${recColor}; border: 1px solid ${recColor}44;">
    Recommendation: ${recLabel || "N/A"}
  </div>

  <div class="summary">${reviewData.summary || ""}</div>

  ${reviewData.detailedFeedback?.plagiarism ? `
  <div class="section">
    <h3>Plagiarism Assessment</h3>
    <p>${reviewData.detailedFeedback.plagiarism.assessment}</p>
    ${reviewData.detailedFeedback.plagiarism.suggestions?.length ? `<div class="sub">Suggestions:</div><ul>${listItems(reviewData.detailedFeedback.plagiarism.suggestions)}</ul>` : ""}
  </div>` : ""}

  ${reviewData.detailedFeedback?.grammar ? `
  <div class="section">
    <h3>Grammar & Structure</h3>
    <p>${reviewData.detailedFeedback.grammar.assessment}</p>
    ${reviewData.detailedFeedback.grammar.issues?.length ? `<div class="sub">Issues Found:</div><ul>${listItems(reviewData.detailedFeedback.grammar.issues)}</ul>` : ""}
    ${reviewData.detailedFeedback.grammar.suggestions?.length ? `<div class="sub">Suggestions:</div><ul>${listItems(reviewData.detailedFeedback.grammar.suggestions)}</ul>` : ""}
  </div>` : ""}

  ${reviewData.detailedFeedback?.content ? `
  <div class="section">
    <h3>Content Quality</h3>
    <p>${reviewData.detailedFeedback.content.assessment}</p>
    ${reviewData.detailedFeedback.content.strengths?.length ? `<div class="sub">Strengths:</div><ul>${listItems(reviewData.detailedFeedback.content.strengths)}</ul>` : ""}
    ${reviewData.detailedFeedback.content.weaknesses?.length ? `<div class="sub">Weaknesses:</div><ul>${listItems(reviewData.detailedFeedback.content.weaknesses)}</ul>` : ""}
    ${reviewData.detailedFeedback.content.suggestions?.length ? `<div class="sub">Suggestions:</div><ul>${listItems(reviewData.detailedFeedback.content.suggestions)}</ul>` : ""}
  </div>` : ""}

  <div class="footer">
    This report was generated by AI-powered analysis and should be used as a supplementary review tool.<br>
    WWJMRD &bull; wwjmrd@gmail.com &bull; www.wwjmrd.com
  </div>
</div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "No authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin role
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
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
        // Fall back to metadata-only review
      }
    }

    // Build content for review - include full document text when available
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

    // Generate review report HTML
    const authorName = (article.profiles as any)?.full_name || "Unknown Author";
    const reportHtml = generateReviewReportHtml(article, reviewData, authorName);

    // Upload review report to storage
    const reportFileName = `review-${article.reference_number}-${Date.now()}.html`;
    const { error: reportUploadError } = await supabase.storage
      .from("review-reports")
      .upload(reportFileName, new Blob([reportHtml], { type: "text/html" }), {
        contentType: "text/html",
        upsert: true,
      });

    if (reportUploadError) {
      console.error("Report upload error:", reportUploadError);
      // Don't fail the whole review, just log the error
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
        reviewed_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: "Failed to save review" }, 500);
    }

    console.log(`AI review completed for article ${articleId}, report: ${reportFileName}`);

    return jsonResponse({
      success: true,
      review,
      reviewReportUrl: reportFileName,
      documentReviewed: !!documentText,
    });
  } catch (error) {
    console.error("AI review error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
