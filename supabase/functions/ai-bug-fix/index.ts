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
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
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

    const { reportId } = await req.json();
    if (!reportId) {
      return new Response(JSON.stringify({ error: "reportId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the bug report
    const { data: report, error: fetchErr } = await adminClient
      .from("bug_reports")
      .select("*")
      .eq("id", reportId)
      .single();
    if (fetchErr || !report) {
      return new Response(JSON.stringify({ error: "Bug report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call AI to analyze and generate troubleshooting response
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiPrompt = `You are a technical support assistant for PubPortal, an academic article publishing platform. A user reported a bug. Analyze it and provide a clear, friendly troubleshooting guide.

Bug Report:
- Title: ${report.title}
- Description: ${report.description || "N/A"}
- Page URL: ${report.page_url || "N/A"}
- Error: ${report.error_stack || "No error stack"}
- Type: ${report.type} (auto = detected automatically, manual = user reported)

Provide:
1. A brief explanation of what likely happened
2. Step-by-step troubleshooting instructions
3. A workaround if applicable

Keep it concise and user-friendly. Do not use markdown headers.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a helpful technical support assistant." },
          { role: "user", content: aiPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const aiMessage = aiData.choices?.[0]?.message?.content || "Unable to generate response.";

    // Update bug report with AI response
    await adminClient
      .from("bug_reports")
      .update({ ai_response: aiMessage, status: "ai_responded" })
      .eq("id", reportId);

    // Send notification to the author
    await adminClient.from("notifications").insert({
      user_id: report.user_id,
      title: "Bug Report Update 🐛",
      message: aiMessage.substring(0, 500),
      type: "info",
      link: "/author",
    });

    return new Response(JSON.stringify({ success: true, response: aiMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-bug-fix error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
