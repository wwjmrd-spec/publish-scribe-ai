// WhatsApp Business Cloud API webhook for the WWJMRD Support Assistant.
//
// GET  -> Meta webhook verification (hub.challenge)
// POST -> incoming user message -> RAG assistant -> reply via WhatsApp Cloud API
//
// Required secrets:
//   WHATSAPP_VERIFY_TOKEN      (you choose it; paste the same value in Meta)
//   WHATSAPP_ACCESS_TOKEN      (permanent system-user token)
//   WHATSAPP_PHONE_NUMBER_ID   (from the Meta WhatsApp app)

import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";

async function sendWhatsApp(to: string, text: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) {
    console.error("WhatsApp credentials missing");
    return;
  }
  const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: text.slice(0, 4000) },
    }),
  });
  if (!r.ok) console.error("WhatsApp send failed", r.status, await r.text());
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ---- Meta verification handshake ----
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && token && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Always 200 quickly so Meta does not retry.
  const payload = await req.json().catch(() => null);
  queueMicrotask(() => handle(payload).catch((e) => console.error("whatsapp handle error", e)));
  return new Response("EVENT_RECEIVED", { status: 200 });
});

async function handle(payload: any) {
  if (!payload) return;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const contactName = value.contacts?.[0]?.profile?.name ?? null;

      for (const msg of value.messages ?? []) {
        if (msg.type !== "text") {
          await sendWhatsApp(msg.from, "I can only read text messages here. Please type your question.");
          continue;
        }
        const from: string = msg.from;
        const text: string = msg.text?.body ?? "";
        if (!text.trim()) continue;

        // One persistent conversation per WhatsApp number.
        const { data: existing } = await sb.from("chat_conversations")
          .select("id, human_takeover")
          .eq("channel", "whatsapp").eq("session_id", from)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();

        if (existing?.human_takeover) {
          // A human agent owns this thread — just record the message.
          await sb.from("chat_messages").insert({
            conversation_id: existing.id, role: "user", content: text,
          });
          continue;
        }

        const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/chatbot-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            message: text,
            sessionId: from,
            conversationId: existing?.id ?? null,
            channel: "whatsapp",
            site: "whatsapp",
            memory: { author_name: contactName },
          }),
        });
        const data = await resp.json().catch(() => ({}));
        const reply = data?.reply ??
          "Thank you for contacting WWJMRD. Our support team will get back to you shortly.";
        await sendWhatsApp(from, reply);
      }
    }
  }
}
