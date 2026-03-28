import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service is not configured");
    }

    const fullText = text.trim();
    const truncatedText = fullText.substring(0, 15000);

    // More accurate page count: count words in full text, ~275 words per page
    const totalWordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;
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
      JSON.stringify({ metadata }),
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
