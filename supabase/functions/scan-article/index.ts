import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Check for required sections in article text
function validateArticleSections(text: string): { valid: boolean; missing: string[]; samples: Record<string, string> } {
  const lowerText = text.toLowerCase();
  const missing: string[] = [];

  const samples: Record<string, string> = {
    "Title": "Your article must start with a clear title, e.g.:\n\"Impact of Machine Learning on Healthcare: A Comprehensive Review\"",
    "Author Name(s) and Affiliation": "Include author details after the title, e.g.:\n\"John Doe¹, Jane Smith²\n¹Department of Computer Science, MIT, USA\n²School of Engineering, Stanford University, USA\"",
    "Abstract (80-120 words)": "Add an abstract section, e.g.:\n\"Abstract: This paper presents a comprehensive review of machine learning applications in healthcare...\"",
    "Keywords (3-5)": "Add keywords after the abstract, e.g.:\n\"Keywords: machine learning, healthcare, deep learning, medical imaging, AI\"",
    "Introduction": "Include an Introduction section, e.g.:\n\"1. Introduction\nThe rapid advancement of artificial intelligence has transformed...\"",
    "References/Bibliography": "End with references, e.g.:\n\"References\n[1] Smith, J. (2023). Machine Learning in Medicine. Journal of AI Research, 45(2), 112-128.\n[2] Doe, A. (2022). Deep Learning Applications. Nature, 580, 123-130.\"",
  };

  // Check for title - first meaningful line (heuristic: check if text starts with something meaningful)
  // Title is hard to detect automatically, we rely on AI extraction for this

  // Check for author/affiliation indicators
  const hasAuthor = /\b(author|affiliation|department|university|institute|college|school of)\b/i.test(text);
  if (!hasAuthor) {
    missing.push("Author Name(s) and Affiliation");
  }

  // Check for abstract
  const hasAbstract = /\babstract\b/i.test(text);
  if (!hasAbstract) {
    missing.push("Abstract (80-120 words)");
  }

  // Check for keywords
  const hasKeywords = /\b(keywords?|key\s*words?|key\s*terms?)\b/i.test(text);
  if (!hasKeywords) {
    missing.push("Keywords (3-5)");
  }

  // Check for introduction
  const hasIntroduction = /\b(introduction|1\.\s*introduction)\b/i.test(text);
  if (!hasIntroduction) {
    missing.push("Introduction");
  }

  // Check for references/bibliography
  const hasReferences = /\b(references?|bibliography|works?\s*cited)\b/i.test(text);
  if (!hasReferences) {
    missing.push("References/Bibliography");
  }

  const resultSamples: Record<string, string> = {};
  for (const m of missing) {
    resultSamples[m] = samples[m] || "";
  }

  return { valid: missing.length === 0, missing, samples: resultSamples };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication ---
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

    const userId = claimsData.claims.sub;

    // --- Input validation ---
    const { text } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Document text is too short to analyze" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Validate required sections ---
    const validation = validateArticleSections(text);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service is not configured");
    }

    const fullText = text.trim();
    const truncatedText = fullText.substring(0, 15000);

    // More accurate page count: count words in full text, ~275 words per page
    const totalWordCount = fullText.split(/\s+/).filter((w: string) => w.length > 0).length;
    const estimatedPageCount = Math.max(1, Math.ceil(totalWordCount / 275));

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
              content: `You are an academic article metadata extractor. Analyze the provided article text and extract structured metadata. You MUST call the extract_article_metadata function with the extracted data.`,
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
                    title: {
                      type: "string",
                      description: "The title of the article",
                    },
                    abstract: {
                      type: "string",
                      description: "The abstract/summary of the article. If not explicitly labeled, summarize the key points in 2-3 sentences.",
                    },
                    keywords: {
                      type: "string",
                      description: "Comma-separated keywords relevant to the article",
                    },
                    subject: {
                      type: "string",
                      description: "The primary academic subject/discipline (e.g., Computer Science, Environmental Biology)",
                    },
                    author_name: {
                      type: "string",
                      description: "The primary author's full name",
                    },
                    co_authors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Co-author full name" },
                          email: { type: "string", description: "Co-author email if found" },
                          affiliation: { type: "string", description: "Co-author institution/affiliation if found" },
                        },
                        required: ["name"],
                      },
                      description: "List of co-authors found in the article",
                    },
                    reason_of_research: {
                      type: "string",
                      description: "The motivation or reason behind the research, extracted from introduction or objectives",
                    },
                    page_count: {
                      type: "integer",
                      description: "The number of pages in the article. Look for page numbers, page breaks, headers/footers with page indicators. If page markers are found, use the highest page number. Otherwise leave empty and the system will estimate from word count.",
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
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "extract_article_metadata") {
      throw new Error("AI did not return structured metadata");
    }

    const metadata = JSON.parse(toolCall.function.arguments);

    // Use AI-detected page count, or fall back to word-count estimate from full text
    if (!metadata.page_count || metadata.page_count < 1) {
      metadata.page_count = estimatedPageCount;
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
