import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin role
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { articleId } = await req.json();

    if (!articleId) {
      return new Response(JSON.stringify({ error: "Article ID required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch article
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      console.error("Article fetch error:", articleError);
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build content for review
    const contentToReview = `
Title: ${article.title}

Abstract: ${article.abstract || "No abstract provided"}

Keywords: ${article.keywords?.join(", ") || "No keywords provided"}
    `.trim();

    console.log("Sending article for AI review:", article.reference_number);

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
            content: `You are an expert academic article reviewer. Analyze the submitted article and provide a comprehensive review covering:

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
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI review failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content;

    if (!responseContent) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse AI response (handle potential markdown code blocks)
    let reviewData;
    try {
      let jsonStr = responseContent;
      // Remove markdown code blocks if present
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\n?/g, "");
      }
      reviewData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseContent);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Failed to save review" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`AI review completed for article ${articleId}`);

    return new Response(
      JSON.stringify({
        success: true,
        review: review,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI review error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
