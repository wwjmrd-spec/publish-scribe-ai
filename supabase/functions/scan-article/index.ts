import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_REASONABLE_PAGE_COUNT = 500;

export function normalizePageCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= MAX_REASONABLE_PAGE_COUNT ? rounded : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_REASONABLE_PAGE_COUNT ? parsed : null;
  }

  return null;
}

function validateArticleSections(text: string): { valid: boolean; missing: string[]; samples: Record<string, string> } {
  const missing: string[] = [];

  const samples: Record<string, string> = {
    "Title": "Your article must start with a clear title.",
    "Author Name(s) and Affiliation": "Include author details after the title.",
    "Abstract (80-120 words)": "Add an abstract section.",
    "Keywords (3-5)": "Add keywords after the abstract.",
    "Introduction": "Include an Introduction section.",
    "References/Bibliography": "End with references.",
  };

  const hasAuthor = /\b(author|affiliation|department|university|institute|college|school of)\b/i.test(text);
  if (!hasAuthor) missing.push("Author Name(s) and Affiliation");

  const hasAbstract = /\babstract\b/i.test(text);
  if (!hasAbstract) missing.push("Abstract (80-120 words)");

  const hasKeywords = /\b(keywords?|key\s*words?|key\s*terms?)\b/i.test(text);
  if (!hasKeywords) missing.push("Keywords (3-5)");

  const hasIntroduction = /\b(introduction|1\.\s*introduction)\b/i.test(text);
  if (!hasIntroduction) missing.push("Introduction");

  const hasReferences = /\b(references?|bibliography|works?\s*cited)\b/i.test(text);
  if (!hasReferences) missing.push("References/Bibliography");

  const resultSamples: Record<string, string> = {};
  for (const m of missing) resultSamples[m] = samples[m] || "";

  return { valid: missing.length === 0, missing, samples: resultSamples };
}

// Improved page count estimation using explicit markers first, then denser journal-text heuristics.
export function estimatePageCount(text: string): number {
  const fullText = text.trim();
  const words = fullText.split(/\s+/).filter((w: string) => w.length > 0);
  const totalWords = words.length;

  // 1. Check for journal page range like "12(04): 06-13" or "pp. 1-8"
  const pageRangeMatch = fullText.match(/\d+\(\d+\)\s*:\s*(\d+)\s*[-–—]\s*(\d+)/);
  if (pageRangeMatch) {
    const startPage = parseInt(pageRangeMatch[1], 10);
    const endPage = parseInt(pageRangeMatch[2], 10);
    if (endPage > startPage && endPage - startPage < 100) {
      return endPage - startPage + 1;
    }
  }

  // 2. Check for "~ N ~" style page markers (common in WWJMRD articles)
  const tildePages = fullText.match(/~\s*(\d+)\s*~/g) || [];
  let maxTildePage = 0;
  let minTildePage = Infinity;
  for (const match of tildePages) {
    const num = parseInt(match.replace(/[^0-9]/g, ''), 10);
    if (num > 0 && num < 500) {
      maxTildePage = Math.max(maxTildePage, num);
      minTildePage = Math.min(minTildePage, num);
    }
  }
  if (maxTildePage > 0 && minTildePage < Infinity) {
    return maxTildePage - minTildePage + 1;
  }

  // 3. Check for "Page N" or standalone page numbers
  const pageIndicators = fullText.match(/\bpage\s+(\d+)\b/gi) || [];
  let maxPageFromIndicators = 0;
  for (const match of pageIndicators) {
    const num = parseInt(match.replace(/\D/g, ''), 10);
    if (num > 0 && num < 200) maxPageFromIndicators = Math.max(maxPageFromIndicators, num);
  }
  if (maxPageFromIndicators > 0) {
    return maxPageFromIndicators;
  }

  // 4. Word-based estimation: journal-style A4 pages are denser than plain-text extraction suggests.
  const wordBasedEstimate = Math.max(1, Math.ceil(totalWords / 425));

  // 5. Character-based estimation: ~2500 characters/page is closer to multi-column academic layouts.
  const charBasedEstimate = Math.max(1, Math.ceil(fullText.length / 2500));

  // 6. Paragraph density: most articles average ~5-7 paragraph blocks per page.
  const paragraphBlocks = fullText.split(/\n\s*\n/).filter((block) => block.trim().length > 0).length;
  const paragraphBasedEstimate = Math.max(1, Math.ceil(paragraphBlocks / 6));

  const sortedEstimates = [wordBasedEstimate, charBasedEstimate, paragraphBasedEstimate].sort((a, b) => a - b);
  return sortedEstimates[Math.floor(sortedEstimates.length / 2)] ?? 1;
}

export function resolveFinalPageCount({
  aiPageCount,
  estimatedPageCount,
  docxPageCount,
}: {
  aiPageCount: unknown;
  estimatedPageCount: number;
  docxPageCount?: unknown;
}): number {
  const trustedDocxPageCount = normalizePageCount(docxPageCount);
  if (trustedDocxPageCount) {
    return trustedDocxPageCount;
  }

  const trustedAiPageCount = normalizePageCount(aiPageCount);
  if (!trustedAiPageCount) {
    return estimatedPageCount;
  }

  const lowerBound = Math.max(1, Math.floor(estimatedPageCount * 0.65));
  const upperBound = Math.max(estimatedPageCount + 2, Math.ceil(estimatedPageCount * 1.35));

  if (trustedAiPageCount < lowerBound || trustedAiPageCount > upperBound) {
    console.log(`AI page count ${trustedAiPageCount} seems unreliable vs estimate ${estimatedPageCount}. Using estimate.`);
    return estimatedPageCount;
  }

  return trustedAiPageCount;
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    const text = payload?.text;
    const docxPageCount = payload?.docxPageCount;

    if (!text || typeof text !== "string" || text.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Document text is too short to analyze" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = validateArticleSections(text);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI service is not configured");

    const fullText = text.trim();
    const truncatedText = fullText.substring(0, 15000);
    const trustedDocxPageCount = normalizePageCount(docxPageCount);

    // Calculate page count locally with improved heuristics, but prefer trusted DOCX metadata.
    const estimatedPageCount = trustedDocxPageCount ?? estimatePageCount(fullText);
    const pageCountGuidance = trustedDocxPageCount
      ? `The uploaded DOCX metadata reports exactly ${trustedDocxPageCount} pages. Treat that as the canonical page_count.`
      : `The document appears to be about ${estimatedPageCount} pages based on extracted text density and explicit page markers.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are an academic article metadata extractor. Extract structured metadata from the article text. You MUST call the extract_article_metadata function. For page_count: look for page numbers, headers, footers, or "Page X" indicators. ${pageCountGuidance} Only return a different page_count if the text contains clear explicit evidence.`,
            },
            {
              role: "user",
              content: `Extract metadata from this academic article:\n\n${truncatedText}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_article_metadata",
                description: "Extract structured metadata from an academic article",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "The title of the article" },
                    abstract: { type: "string", description: "The abstract/summary of the article." },
                    keywords: { type: "string", description: "Comma-separated keywords" },
                    subject: { type: "string", description: "Primary academic subject/discipline" },
                    author_name: { type: "string", description: "Primary author's full name" },
                    co_authors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          email: { type: "string" },
                          affiliation: { type: "string" },
                        },
                        required: ["name"],
                      },
                    },
                    reason_of_research: { type: "string", description: "Motivation behind the research" },
                    page_count: {
                      type: "integer",
                      description: `Number of pages. Only set this if you find explicit page markers (e.g. 'Page 5', page numbers in headers/footers). If unsure, leave empty and the system will use ${estimatedPageCount} (estimated from word count).`,
                    },
                  },
                  required: ["title"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_article_metadata" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "extract_article_metadata") {
      throw new Error("AI did not return structured metadata");
    }

    const metadata = JSON.parse(toolCall.function.arguments);

    metadata.page_count = resolveFinalPageCount({
      aiPageCount: metadata.page_count,
      estimatedPageCount,
      docxPageCount: trustedDocxPageCount,
    });

    return new Response(
      JSON.stringify({ 
        metadata,
        validation: {
          valid: validation.valid,
          missing: validation.missing,
          samples: validation.samples,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("scan-article error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

if (import.meta.main) {
  serve(handler);
}
