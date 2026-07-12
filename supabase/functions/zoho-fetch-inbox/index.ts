// Polls Zoho Mail Inbox (read-only), saves new messages, kicks off AI drafting.
// Triggered by pg_cron every 5 min OR manually from admin UI.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ZohoConfig = {
  region: string;
  accountId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  diagnostics: Record<string, unknown>;
};

class ZohoSetupError extends Error {
  code = "ZOHO_SETUP_ERROR";
  status = 200;
  constructor(message: string, public detail?: Record<string, unknown>) {
    super(message);
  }
}

function normalizeRegion(region?: string | null) {
  const cleaned = String(region || "com").trim().toLowerCase();
  return ["com", "in", "eu", "com.au"].includes(cleaned) ? cleaned : "com";
}

function describeLoadedSecret(value: string, source: "runtime_secret" | "admin_settings") {
  return {
    source,
    set: !!value,
    length: value.length,
  };
}

async function getZohoConfig(supabase: ReturnType<typeof createClient>): Promise<ZohoConfig> {
  const { data: settings } = await supabase
    .from("ai_email_settings")
    .select("zoho_account_id, zoho_region, zoho_client_id, zoho_client_secret, zoho_refresh_token")
    .limit(1)
    .maybeSingle();

  // Prefer Lovable Cloud runtime secrets over database fields. The settings table
  // may contain old Zoho Self Client values entered through the admin UI, and a
  // stale DB refresh token can incorrectly override a valid ZOHO_MAIL_REFRESH_TOKEN secret.
  const envRegion = Deno.env.get("ZOHO_MAIL_REGION");
  const envAccountId = Deno.env.get("ZOHO_MAIL_ACCOUNT_ID");
  const envClientId = Deno.env.get("ZOHO_MAIL_CLIENT_ID");
  const envClientSecret = Deno.env.get("ZOHO_MAIL_CLIENT_SECRET");
  const envRefreshToken = Deno.env.get("ZOHO_MAIL_REFRESH_TOKEN");

  const config = {
    region: normalizeRegion(envRegion || settings?.zoho_region),
    accountId: String(envAccountId || settings?.zoho_account_id || "").trim(),
    clientId: String(envClientId || settings?.zoho_client_id || "").trim(),
    clientSecret: String(envClientSecret || settings?.zoho_client_secret || "").trim(),
    refreshToken: String(envRefreshToken || settings?.zoho_refresh_token || "").trim(),
    diagnostics: {
      tokenRequest: {
        method: "POST",
        url: `https://accounts.zoho.${normalizeRegion(envRegion || settings?.zoho_region)}/oauth/v2/token`,
        grant_type: "refresh_token",
        content_type: "application/x-www-form-urlencoded",
      },
      region: { value: normalizeRegion(envRegion || settings?.zoho_region), source: envRegion ? "runtime_secret" : "admin_settings" },
      accountId: describeLoadedSecret(String(envAccountId || settings?.zoho_account_id || "").trim(), envAccountId ? "runtime_secret" : "admin_settings"),
      clientId: describeLoadedSecret(String(envClientId || settings?.zoho_client_id || "").trim(), envClientId ? "runtime_secret" : "admin_settings"),
      clientSecret: describeLoadedSecret(String(envClientSecret || settings?.zoho_client_secret || "").trim(), envClientSecret ? "runtime_secret" : "admin_settings"),
      refreshToken: describeLoadedSecret(String(envRefreshToken || settings?.zoho_refresh_token || "").trim(), envRefreshToken ? "runtime_secret" : "admin_settings"),
    },
  };

  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "region" && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new ZohoSetupError(`Zoho Mail credentials are incomplete. Missing: ${missing.join(", ")}. Set them in Admin → Email Assistant → Settings.`, { missing });
  }

  return config;
}

async function getAccessToken(config: ZohoConfig): Promise<string> {
  const url = `https://accounts.zoho.${config.region}/oauth/v2/token`;
  const body = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await r.text();
  let j: any = {};
  try { j = JSON.parse(text); } catch { /* ignore */ }
  if (!j.access_token) {
    if (j.error === "invalid_code" || j.error === "invalid_client") {
      throw new ZohoSetupError(
        `Zoho connection needs to be reconnected. The saved refresh token was rejected by Zoho (${j.error}) for region "${config.region}". ` +
        `Generate a new Self Client refresh token in the same Zoho data center with scopes ZohoMail.accounts.READ, ZohoMail.messages.READ, ZohoMail.folders.READ, then update the saved ZOHO_MAIL_REFRESH_TOKEN secret.`,
        { zoho_error: j.error, region: config.region, loaded: config.diagnostics }
      );
    }
    throw new Error(`Zoho OAuth failed (${r.status}): ${text}`);
  }
  return j.access_token;
}

async function listInbox(config: ZohoConfig, token: string, limit = 25): Promise<any[]> {
  const url = `https://mail.zoho.${config.region}/api/accounts/${config.accountId}/messages/view?folder=Inbox&limit=${limit}&start=1`;
  const r = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!r.ok) throw new Error(`Zoho list failed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.data || [];
}

async function fetchContent(config: ZohoConfig, token: string, folderId: string, messageId: string): Promise<{ content: string }> {
  const url = `https://mail.zoho.${config.region}/api/accounts/${config.accountId}/folders/${folderId}/messages/${messageId}/content`;
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
    const config = await getZohoConfig(supabase);
    const token = await getAccessToken(config);
    const messages = await listInbox(config, token, 30);

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
          const c = await fetchContent(config, token, folderId, messageId);
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
    const status = e instanceof ZohoSetupError ? e.status : 500;
    const body = {
      ok: false,
      code: e?.code || "ZOHO_FETCH_ERROR",
      error: String(e?.message || e),
      detail: e?.detail || undefined,
    };
    await supabase.from("ai_email_logs").insert({ action: "error", detail: { where: "fetch", ...body } });
    const { data: settings } = await supabase.from("ai_email_settings").select("id").limit(1).maybeSingle();
    if (settings?.id) {
      await supabase.from("ai_email_settings").update({
        last_poll_at: new Date().toISOString(),
        last_poll_status: body.error,
      }).eq("id", settings.id);
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
