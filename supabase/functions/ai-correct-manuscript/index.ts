import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.6.0";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "npm:docx@8.5.0";

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

async function downloadDocxText(supabase: any, bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Failed to download from ${bucket}: ${error?.message}`);
  const arrayBuffer = await data.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

function buildDocxFromText(title: string, body: string): Promise<Uint8Array> {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    }),
    new Paragraph({ children: [new TextRun("")] }),
  ];

  for (const block of blocks) {
    const isHeading =
      /^#{1,3}\s+/.test(block) ||
      (block.length < 120 && /^[A-Z][A-Z0-9 ,:&-]+$/.test(block));

    if (isHeading) {
      const text = block.replace(/^#{1,3}\s+/, "");
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text, bold: true, size: 26 })],
        })
      );
    } else {
      const lines = block.split(/\n/);
      const runs: TextRun[] = [];
      lines.forEach((line, i) => {
        runs.push(new TextRun({ text: line, size: 24 }));
        if (i < lines.length - 1) runs.push(new TextRun({ text: "", break: 1 }));
      });
      children.push(
        new Paragraph({
          spacing: { after: 160, line: 360 },
          alignment: AlignmentType.JUSTIFIED,
          children: runs,
        })
      );
    }
  }

  const doc = new Document({
    creator: "WWJMRD AI Auto-Correct",
    title,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc).then((b) => new Uint8Array(b));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "No authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const token = authHeader.replace("Bearer ", "").trim();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { articleId, mode } = body as { articleId: string; mode?: "preview" | "submit" };
    if (!articleId) return jsonResponse({ error: "articleId required" }, 400);

    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .single();
    if (articleError || !article) return jsonResponse({ error: "Article not found" }, 404);
    if (article.author_id !== userId) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    const isPro =
      sub?.plan_type === "pro" &&
      (!sub.expires_at || new Date(sub.expires_at) > new Date());
    if (!isPro) return jsonResponse({ error: "Pro plan required" }, 403);

    if (!article.review_report_url) {
      return jsonResponse({ error: "Generate the AI review report first" }, 400);
    }

    const { data: review } = await supabase
      .from("article_reviews")
      .select("*")
      .eq("article_id", articleId)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!review) return jsonResponse({ error: "No AI review found" }, 400);

    const docPath = article.document_url;
    if (!docPath) return jsonResponse({ error: "No manuscript file on article" }, 400);
    const manuscriptText = await downloadDocxText(supabase, "documents", docPath);
    if (!manuscriptText || manuscriptText.trim().length < 50) {
      return jsonResponse({ error: "Could not read the manuscript text" }, 400);
    }

    const feedback = review.detailed_feedback as any;
    const feedbackText = JSON.stringify(
      {
        summary: review.summary,
        scores: {
          grammar: review.grammar_score,
          content: review.content_score,
          overall: review.overall_score,
        },
        feedback,
      },
      null,
      2
    );

    console.log(
      "Starting AI correction:",
      article.reference_number,
      "manuscript chars:",
      manuscriptText.length
    );

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are an elite academic editor for a peer-reviewed journal. You will receive (1) a manuscript and (2) a peer-review report with weakness lists, issues, and suggestions.

YOUR GOAL: produce a fully corrected manuscript that would score AT LEAST 90/100 on a fresh AI peer review across plagiarism originality, grammar/structure, and content quality. Address EVERY weakness, issue, and suggestion in the review report.

QUALITY BAR (target 90+):
- Plagiarism (target 95+): Rephrase common/generic phrases in original wording. Vary sentence openers. Replace clichés and boilerplate with precise academic language.
- Grammar & Structure (target 92+): Flawless grammar, punctuation, agreement, tense consistency. Active voice where natural. Clear topic sentences. Smooth transitions between paragraphs and sections. No run-on or fragmentary sentences.
- Content Quality (target 90+): Tighten the abstract. Sharpen the research aim and contribution. Strengthen the literature framing, methodology rigour, and discussion of implications. Add an explicit limitations and future-work paragraph if missing. Make the conclusion crisp and tied to the stated objectives.

HARD RULES:
- DO NOT invent data, results, numbers, citations, references, authors, or facts. Keep ALL factual content (numbers, tables, citations, dataset names, equations, references list) exactly as in the original — only rewrite the surrounding prose.
- Preserve every section that exists in the original (Abstract, Introduction, Literature Review, Methodology, Results, Discussion, Conclusion, References, etc.). Keep references list verbatim.
- Keep the manuscript at least as long as the original; do not summarise or shorten substantive sections.
- Write in formal academic English, third person, past tense for methods/results, present tense for established facts.
- Output the FULL corrected manuscript text — no preface, no commentary, no markdown fences.
- Use blank lines between paragraphs. Put each section heading on its own line in UPPERCASE (e.g. "ABSTRACT", "INTRODUCTION", "METHODOLOGY", "RESULTS AND DISCUSSION", "CONCLUSION", "REFERENCES").

You MUST respond using the provided "return_corrected_manuscript" tool call ONLY. Do not respond with plain text.`,
          },
          {
            role: "user",
            content: `PEER-REVIEW REPORT (JSON — address every weakness, issue and suggestion below):\n${feedbackText}\n\n---\n\nORIGINAL MANUSCRIPT (rewrite this fully to reach a 90+ score; preserve all factual content and references verbatim):\n${manuscriptText.substring(
              0,
              90000
            )}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_corrected_manuscript",
              description:
                "Return the fully corrected manuscript text plus a short bullet list summarising the changes made.",
              parameters: {
                type: "object",
                properties: {
                  corrected_manuscript: {
                    type: "string",
                    description:
                      "Full corrected manuscript text with paragraphs separated by blank lines and section headings on their own lines.",
                  },
                  change_summary: {
                    type: "array",
                    items: { type: "string" },
                    description: "5-12 short bullet points describing the corrections made.",
                  },
                },
                required: ["corrected_manuscript", "change_summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "return_corrected_manuscript" },
        },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429)
        return jsonResponse({ error: "Rate limit exceeded. Please try again shortly." }, 429);
      if (aiResp.status === 402)
        return jsonResponse(
          { error: "AI credits exhausted. Please add funds in Workspace settings." },
          402
        );
      return jsonResponse({ error: "AI correction failed" }, 500);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiData).slice(0, 500));
      return jsonResponse({ error: "AI did not return a corrected manuscript" }, 500);
    }

    let parsed: { corrected_manuscript: string; change_summary: string[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return jsonResponse({ error: "AI response could not be parsed" }, 500);
    }

    const correctedText = parsed.corrected_manuscript || "";
    const changeSummary = Array.isArray(parsed.change_summary) ? parsed.change_summary : [];

    if (correctedText.trim().length < 100) {
      return jsonResponse({ error: "Corrected manuscript was too short" }, 500);
    }

    const docxBytes = await buildDocxFromText(article.title || "Corrected Manuscript", correctedText);

    const filePath = `${userId}/${crypto.randomUUID()}-ai-corrected.docx`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, new Blob([docxBytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }), {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return jsonResponse({ error: "Failed to save corrected manuscript" }, 500);
    }

    if (mode === "submit") {
      // Determine the right "revised" status based on current state
      const currentStatus = article.status as string | null;
      const nextStatus =
        currentStatus === "rejected" || currentStatus === "revision_requested"
          ? "revised_submitted"
          : currentStatus === "ai_review_generated" ||
            currentStatus === "under_review" ||
            currentStatus === "submitted"
          ? "revised_submitted"
          : "revised_submitted";

      const { error: updateError } = await supabase
        .from("articles")
        .update({
          document_url: filePath,
          status: nextStatus as any,
          // Clear stale review report so admin/author can see a fresh re-analysis is needed
          review_report_url: null,
        })
        .eq("id", articleId);
      if (updateError) {
        console.error("Article update error:", updateError);
        return jsonResponse({ error: "Failed to attach corrected manuscript" }, 500);
      }

      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (admins && admins.length) {
        await supabase.from("notifications").insert(
          admins.map((a: any) => ({
            user_id: a.user_id,
            title: "Revised Manuscript Submitted ✨",
            message: `Author submitted an AI-corrected revised manuscript for "${article.title}" (${article.reference_number}). Please re-analyze with AI Article Review.`,
            type: "info",
            link: `/admin/ai-review?articleId=${articleId}`,
          }))
        );
      }
    }

    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(filePath, 60 * 60);

    return jsonResponse({
      success: true,
      mode: mode || "preview",
      filePath,
      downloadUrl: signed?.signedUrl || null,
      changeSummary,
      previewText: correctedText.slice(0, 4000),
    });
  } catch (err) {
    console.error("ai-correct-manuscript error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500
    );
  }
});
