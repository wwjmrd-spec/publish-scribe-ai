// Public, key-authenticated chatbot API for embedding the assistant on any site.
//
// POST /chatbot-public  { action, publicKey, ... }
//   action "config"   -> widget branding + welcome message
//   action "message"  -> { sessionId, conversationId?, message, memory? } -> assistant reply
//   action "feedback" -> { messageId, rating }
//   action "ticket"   -> { name, email, subject, message, conversationId? }
//
// Auth is the site's public key plus an Origin allowlist. No Supabase JWT needed.

import { createClient } from "npm:@supabase/supabase-js@2";

const baseCors = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

// Simple in-memory rate limit: 30 messages / minute / session.
const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || now > cur.reset) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  cur.n += 1;
  return cur.n > limit;
}

function originAllowed(site: any, origin: string | null) {
  const list: string[] = site.allowed_origins ?? [];
  if (list.length === 0) return true;
  if (!origin) return true; // server-to-server calls have no Origin
  return list.some((o) => o === "*" || o.replace(/\/$/, "") === origin.replace(/\/$/, ""));
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = { ...baseCors, "Access-Control-Allow-Origin": origin ?? "*" };
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const publicKey = String(body.publicKey ?? "").trim();
    if (!publicKey) return json({ error: "publicKey is required" }, 401);

    const { data: site } = await sb.from("chatbot_sites")
      .select("*").eq("public_key", publicKey).eq("is_active", true).maybeSingle();
    if (!site) return json({ error: "Invalid or inactive public key" }, 401);
    if (!originAllowed(site, origin)) return json({ error: "Origin not allowed for this key" }, 403);

    const action = String(body.action ?? "message");

    if (action === "config") {
      return json({
        site: site.slug,
        name: site.name,
        logoUrl: site.logo_url,
        primaryColor: site.primary_color,
        welcomeMessage: site.welcome_message,
        language: site.language,
        theme: site.theme,
      });
    }

    if (action === "feedback") {
      const rating = Number(body.rating);
      if (!body.messageId || ![1, -1].includes(rating)) return json({ error: "Invalid feedback" }, 400);
      await sb.from("chat_messages").update({ feedback: rating }).eq("id", body.messageId);
      return json({ success: true });
    }

    if (action === "ticket") {
      const { error } = await sb.from("support_tickets").insert({
        conversation_id: body.conversationId ?? null,
        name: String(body.name ?? "Website visitor").slice(0, 120),
        email: String(body.email ?? "").slice(0, 200),
        subject: String(body.subject ?? "Support request").slice(0, 200),
        question: String(body.message ?? "").slice(0, 4000),
        channel: "sdk",
        site: site.slug,
        status: "open",
      });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "message") {
      const sessionId = String(body.sessionId ?? crypto.randomUUID());
      if (rateLimited(`${site.slug}:${sessionId}`)) {
        return json({ error: "Too many messages. Please wait a moment." }, 429);
      }

      const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/chatbot-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          message: body.message,
          sessionId,
          conversationId: body.conversationId ?? null,
          channel: "sdk",
          site: site.slug,
          memory: body.memory ?? {},
        }),
      });
      const data = await resp.json();
      return json(data, resp.status);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("chatbot-public error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
