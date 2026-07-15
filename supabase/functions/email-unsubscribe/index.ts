import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CATEGORY_LABEL: Record<string, string> = {
  fee_reminder: "Publication fee reminders",
  revision_requested: "Manuscript revision reminders",
  marketing: "Marketing & promotional emails",
  announcements: "Product announcements",
};

const CATEGORY_COLUMN: Record<string, string> = {
  fee_reminder: "fee_reminder_enabled",
  revision_requested: "revision_requested_enabled",
  marketing: "marketing_enabled",
  announcements: "announcements_enabled",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const token: string | undefined = body?.token || url.searchParams.get("token") || undefined;
    const action: string = body?.action || "info";

    if (!token) return json(400, { error: "Missing token" });

    const { data: tokenRow } = await supabase
      .from("email_unsubscribe_tokens")
      .select("author_id, category")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow) return json(404, { error: "Invalid or expired token" });

    const category = tokenRow.category as string;
    const authorId = tokenRow.author_id as string;
    const column = CATEGORY_COLUMN[category];
    if (!column) return json(400, { error: "Unknown category" });

    const { data: prefs } = await supabase
      .from("email_preferences")
      .select(`email, ${column}`)
      .eq("author_id", authorId)
      .maybeSingle();

    if (action === "info") {
      return json(200, {
        email: prefs?.email ?? null,
        category,
        categoryLabel: CATEGORY_LABEL[category] || category,
        enabled: (prefs as any)?.[column] ?? true,
      });
    }

    if (action !== "unsubscribe" && action !== "resubscribe") {
      return json(400, { error: "Invalid action" });
    }

    const enable = action === "resubscribe";
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      null;
    const userAgent = req.headers.get("user-agent") || null;

    // Upsert to guarantee the row exists.
    await supabase
      .from("email_preferences")
      .upsert(
        { author_id: authorId, email: prefs?.email || "unknown", [column]: enable },
        { onConflict: "author_id" },
      );

    await supabase.from("email_preference_audit").insert({
      author_id: authorId,
      email: prefs?.email || null,
      category,
      action: enable ? "subscribed" : "unsubscribed",
      source: "email_link",
      ip_address: clientIp,
      user_agent: userAgent,
    });

    return json(200, {
      success: true,
      category,
      categoryLabel: CATEGORY_LABEL[category] || category,
      enabled: enable,
    });
  } catch (e: any) {
    console.error("[email-unsubscribe]", e?.message || e);
    return json(500, { error: e?.message || "Internal error" });
  }
});
