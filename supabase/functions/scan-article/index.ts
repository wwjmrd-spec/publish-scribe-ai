import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// Improved page count estimation using multiple heuristics
function estimatePageCount(text: string): number {
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

  // 4. Word-based estimation: ~300 words/page for extracted text (mammoth adds extra metadata)
  const wordBasedEstimate = Math.max(1, Math.ceil(totalWords / 300));

  // 5. Character-based estimation: ~2000 characters per page
  const charBasedEstimate = Math.max(1, Math.ceil(fullText.length / 2000));

  // Average, weighted toward word count
  const avgEstimate = Math.round((wordBasedEstimate * 2 + charBasedEstimate) / 3);
  return Math.max(1, avgEstimate);
}

serve(async (req) => {
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

    const { text } = await req.json();

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
    
    // Calculate page count locally with improved heuristics
    const estimatedPageCount = estimatePageCount(fullText);

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
              content: `You are an academic article metadata extractor. Extract structured metadata from the article text. You MUST call the extract_article_metadata function. For page_count: look for page numbers, headers, footers, or "Page X" indicators. The document has approximately ${estimatedPageCount} pages based on word count analysis (~250 words per page for academic articles). Only override this estimate if you find explicit page number indicators in the text.`,
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

    // Use AI page count only if reasonable, otherwise use our local estimate
    if (!metadata.page_count || metadata.page_count < 1) {
      metadata.page_count = estimatedPageCount;
    } else {
      // Sanity check: AI page count should be within 3x of our estimate
      if (metadata.page_count > estimatedPageCount * 3 || metadata.page_count < Math.max(1, Math.floor(estimatedPageCount / 3))) {
        console.log(`AI page count ${metadata.page_count} seems unreliable vs estimate ${estimatedPageCount}. Using estimate.`);
        metadata.page_count = estimatedPageCount;
      }
    }

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
});
