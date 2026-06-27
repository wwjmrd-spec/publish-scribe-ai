// Polls Zoho Mail Inbox (read-only), saves new messages, kicks off AI drafting.
// Triggered by pg_cron every 5 min OR manually from admin UI.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REGION = Deno.env.get("ZOHO_MAIL_REGION") || "com";
const ACCOUNT_ID = Deno.env.get("ZOHO_MAIL_ACCOUNT_ID")!;
const CLIENT_ID = Deno.env.get("ZOHO_MAIL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("ZOHO_MAIL_CLIENT_SECRET")!;
const REFRESH_TOKEN = Deno.env.get("ZOHO_MAIL_REFRESH_TOKEN")!;

async function getAccessToken(): Promise<string> {
  const url = `https://accounts.zoho.${REGION}/oauth/v2/token`;
  const body = new URLSearchParams({
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const r = await fetch(url, { method: "POST", body });
  if (!r.ok) throw new Error(`Zoho OAuth failed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  if (!j.access_token) throw new Error(`Zoho OAuth no token: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function listInbox(token: string, limit = 25): Promise<any[]> {
  const url = `https://mail.zoho.${REGION}/api/accounts/${ACCOUNT_ID}/messages/view?folder=Inbox&limit=${limit}&start=1`;
  const r = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!r.ok) throw new Error(`Zoho list failed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.data || [];
}

async function fetchContent(token: string, folderId: string, messageId: string): Promise<{ content: string }> {
  const url = `https://mail.zoho.${REGION}/api/accounts/${ACCOUNT_ID}/folders/${folderId}/messages/${messageId}/content`;
  const r = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  if (!r.ok) return { content: "" };
  const j = await r.json();
  return { content: j?.data?.content || "" };
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (!ACCOUNT_ID || !CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      throw new Error("Zoho Mail credentials are not configured");
    }

    const token = await getAccessToken();
    const messages = await listInbox(token, 30);

    let inserted = 0;
    const newIds: string[] = [];

    for (const m of messages) {
      const messageId = String(m.messageId || m.entityId || "");
      if (!messageId) continue;

      // dedupe
      const { data: existing } = await supabase
        .from("ai_emails").select("id").eq("zoho_message_id", messageId).maybeSingle();
      if (existing) continue;

      let bodyHtml = "";
      let bodyText = "";
      try {
        const folderId = String(m.folderId || "");
        if (folderId) {
          const c = await fetchContent(token, folderId, messageId);
          bodyHtml = c.content || "";
          bodyText = stripHtml(bodyHtml);
        }
      } catch (_) { /* ignore */ }

      const receivedAt = m.receivedTime ? new Date(Number(m.receivedTime)).toISOString() : new Date().toISOString();

      const { data: ins } = await supabase.from("ai_emails").insert({
        zoho_message_id: messageId,
        zoho_thread_id: m.threadId ? String(m.threadId) : null,
        folder: "Inbox",
        subject: m.subject || "(no subject)",
        from_name: m.fromAddress?.split("<")[0]?.trim() || m.sender || "",
        from_email: m.fromAddress?.match(/<([^>]+)>/)?.[1] || m.fromAddress || m.sender || "",
        to_email: m.toAddress || "",
        body_text: bodyText.slice(0, 50000),
        body_html: bodyHtml.slice(0, 200000),
        snippet: (m.summary || bodyText).slice(0, 300),
        received_at: receivedAt,
        has_attachments: !!m.hasAttachment,
        raw: m,
        status: "new",
      }).select("id").maybeSingle();

      if (ins?.id) {
        inserted++;
        newIds.push(ins.id);
      }
    }

    // mark last poll
    const { data: settings } = await supabase.from("ai_email_settings").select("id, ai_enabled").limit(1).maybeSingle();
    if (settings?.id) {
      await supabase.from("ai_email_settings").update({
        last_poll_at: new Date().toISOString(),
        last_poll_status: `ok: ${inserted} new`,
      }).eq("id", settings.id);
    }

    await supabase.from("ai_email_logs").insert({
      action: "fetch",
      detail: { inserted, total: messages.length },
    });

    // Kick off draft generation for new emails (fire-and-forget)
    if (settings?.ai_enabled !== false) {
      for (const emailId of newIds) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-email-draft`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ email_id: emailId }),
        }).catch(() => { });
      }
    }

    return new Response(JSON.stringify({ ok: true, inserted, total: messages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("zoho-fetch-inbox error", e);
    await supabase.from("ai_email_logs").insert({ action: "error", detail: { where: "fetch", message: String(e?.message || e) } });
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
