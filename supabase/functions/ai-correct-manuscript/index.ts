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

const SYSTEM_PROMPT = `You are an elite academic editor for a peer-reviewed journal. You will receive (1) a manuscript section and (2) a peer-review report with weaknesses, issues, and suggestions.

YOUR GOAL: rewrite the supplied section so the full manuscript would trend toward a 90+ score on a fresh AI peer review across originality, grammar/structure, and content quality.

QUALITY BAR:
- Remove weak, generic, repetitive, and awkward phrasing.
- Improve academic clarity, logical flow, transitions, precision, and structure.
- Strengthen framing, discussion, implication, and conclusion language where relevant.
- Preserve all factual content, data, numbers, citations, equations, dataset names, and references exactly as given.

HARD RULES:
- Do NOT invent data, results, numbers, citations, references, authors, or facts.
- Keep section headings if present.
- Keep the rewritten section at least as informative as the original.
- Return ONLY the rewritten text for that section through the tool call.
`;

function chunkManuscript(text: string, maxChars = 18000) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChars) {
      chunks.push(paragraph.slice(index, index + maxChars));
    }
    current = "";
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

async function rewriteChunk(
  lovableApiKey: string,
  feedbackText: string,
  chunk: string,
  chunkIndex: number,
  chunkCount: number,
) {
  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `PEER-REVIEW REPORT (apply every relevant issue below):\n${feedbackText}\n\n---\n\nSECTION ${chunkIndex + 1} OF ${chunkCount}\nRewrite this manuscript section to satisfy the review report while preserving all factual content:\n\n${chunk}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_rewritten_section",
            description: "Return the rewritten section text and a few short notes about what was improved.",
            parameters: {
              type: "object",
              properties: {
                rewritten_section: { type: "string" },
                chunk_summary: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["rewritten_section", "chunk_summary"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "return_rewritten_section" },
      },
    }),
  });

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    console.error("AI gateway error:", aiResp.status, errText);
    if (aiResp.status === 429) throw Object.assign(new Error("Rate limit exceeded. Please try again shortly."), { status: 429 });
    if (aiResp.status === 402) throw Object.assign(new Error("AI credits exhausted. Please add funds in Workspace settings."), { status: 402 });
    throw new Error("AI correction failed");
  }

  const aiData = await aiResp.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("No tool call in AI response:", JSON.stringify(aiData).slice(0, 500));
    throw new Error("AI did not return a corrected manuscript section");
  }

  const parsed = JSON.parse(toolCall.function.arguments) as {
    rewritten_section: string;
    chunk_summary: string[];
  };

  return {
    rewrittenSection: parsed.rewritten_section || "",
    chunkSummary: Array.isArray(parsed.chunk_summary) ? parsed.chunk_summary : [],
  };
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

    const chunks = chunkManuscript(manuscriptText);
    console.log("AI correction chunks:", chunks.length);

    const rewrittenChunks: string[] = [];
    const summarySet = new Set<string>();

    try {
      for (let index = 0; index < chunks.length; index++) {
        const result = await rewriteChunk(lovableApiKey, feedbackText, chunks[index], index, chunks.length);
        if (!result.rewrittenSection.trim()) {
          throw new Error(`Corrected manuscript section ${index + 1} was empty`);
        }
        rewrittenChunks.push(result.rewrittenSection.trim());
        for (const item of result.chunkSummary) {
          if (item?.trim()) summarySet.add(item.trim());
        }
      }
    } catch (error) {
      const status = (error as any)?.status;
      if (status === 429 || status === 402) {
        return jsonResponse({ error: error instanceof Error ? error.message : "AI correction failed" }, status);
      }
      console.error("Chunk rewrite error:", error);
      return jsonResponse({ error: error instanceof Error ? error.message : "AI correction failed" }, 500);
    }

    const correctedText = rewrittenChunks.join("\n\n");
    const changeSummary = Array.from(summarySet).slice(0, 12);

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
      const { error: updateError } = await supabase
        .from("articles")
        .update({
          document_url: filePath,
          status: "revised_submitted" as any,
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
