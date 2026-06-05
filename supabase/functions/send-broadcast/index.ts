import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Recipient {
  user_id: string;
  email: string;
  name?: string;
}

interface BroadcastRequest {
  title: string;
  message: string;
  type?: string;
  link?: string;
  recipients: Recipient[];
  send_email: boolean;
  email_provider_override?: string;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const wrapEmail = (title: string, bodyContent: string): string => `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#0d1528; width:100%; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0d1528" style="background-color:#0d1528;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" style="display:block; max-width:200px; height:auto;" />
            </td>
          </tr>
          <tr>
            <td bgcolor="#151d35" style="background-color:#151d35; border-radius:12px; padding:32px 28px; border:1px solid rgba(255,255,255,0.08);">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#6b7280; margin:0;">&copy; ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const emailH1 = (text: string) =>
  `<h1 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:24px; font-weight:600; color:#ffffff; text-align:center; margin:0 0 24px;">${escapeHtml(text)}</h1>`;

const emailP = (text: string, extra = "") =>
  `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; line-height:26px; color:#d1d5db; margin:16px 0;${extra}">${text}</p>`;

const emailButton = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;"><tr><td align="center"><a href="${href}" target="_blank" style="display:inline-block; background-color:#00d4ff; color:#0d1528; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`;

const emailDivider = () =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr><td style="border-top:1px solid rgba(255,255,255,0.1);"></td></tr></table>`;

function buildBroadcastHtml(title: string, message: string, link?: string): string {
  const formattedMessage = escapeHtml(message)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; line-height:26px; color:#d1d5db; margin:12px 0;">${line}</p>`)
    .join("");

  const linkSection = link
    ? emailButton(link.startsWith("http") ? link : `https://wwjmrdai.online${link.startsWith("/") ? "" : "/"}${link}`, "Open Link")
    : "";

  const body = `
    ${emailH1(title)}
    ${formattedMessage}
    ${linkSection}
    ${emailDivider()}
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; line-height:22px; color:#9ca3af; margin:16px 0 0;">You received this message because you are a registered author on WWJMRD.</p>
  `;
  return wrapEmail(title, body);
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - must be admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body: BroadcastRequest = await req.json();
    const { title, message, type = "info", link, recipients, send_email, email_provider_override } = body;

    if (!title?.trim() || !message?.trim()) {
      return new Response(JSON.stringify({ error: "Missing title or message" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailCount = { sent: 0, failed: 0 };

    // Insert notifications in batches
    const notifications = recipients.map((r) => ({
      user_id: r.user_id,
      title: title.trim(),
      message: message.trim(),
      type,
      link: link?.trim() || null,
    }));

    let insertedNotifications = 0;
    for (let i = 0; i < notifications.length; i += 100) {
      const batch = notifications.slice(i, i + 100);
      const { error } = await adminClient.from("notifications").insert(batch);
      if (error) {
        console.error("Notification insert error:", error);
      } else {
        insertedNotifications += batch.length;
      }
    }

    // Send emails if requested
    if (send_email) {
      const emailHtml = buildBroadcastHtml(title.trim(), message.trim(), link);

      // Resolve each recipient's sign-in email from auth.users (source of truth)
      for (const recipient of recipients) {
        let sendTo = recipient.email;
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(recipient.user_id);
          if (authUser?.user?.email) {
            sendTo = authUser.user.email;
          }
        } catch (e) {
          console.error(`Auth lookup failed for ${recipient.user_id}:`, (e as any)?.message);
        }

        if (!sendTo) {
          emailCount.failed++;
          continue;
        }

        try {
          // Route through send-email so the configured provider chain + override apply
          const { data: sendData, error: sendErr } = await adminClient.functions.invoke("send-email", {
            body: {
              to: sendTo,
              template: "custom",
              subject: title.trim(),
              html: emailHtml,
              providerOverride: email_provider_override || undefined,
            },
          });
          if (sendErr || (sendData as any)?.error) throw new Error(sendErr?.message || (sendData as any)?.error || "send-email failed");
          emailCount.sent++;

          // Log to email_log (best-effort)
          try {
            await adminClient.from("email_log").insert({
              recipient_email: sendTo,
              recipient_name: recipient.name || null,
              subject: title.trim(),
              template_name: "broadcast",
              email_type: "broadcast",
              status: "sent",
              related_user_id: recipient.user_id,
              metadata: { message: message.trim(), link: link || null },
            });
          } catch (_) {
            // Ignore logging errors
          }
        } catch (err: any) {
          console.error(`Email send failed for ${sendTo}:`, err?.message);
          emailCount.failed++;

          try {
            await adminClient.from("email_log").insert({
              recipient_email: sendTo,
              recipient_name: recipient.name || null,
              subject: title.trim(),
              template_name: "broadcast",
              email_type: "broadcast",
              status: "failed",
              error_message: err?.message || "Unknown error",
              related_user_id: recipient.user_id,
              metadata: { message: message.trim(), link: link || null },
            });
          } catch (_) {
            // Ignore logging errors
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_sent: insertedNotifications,
        emails_sent: emailCount.sent,
        emails_failed: emailCount.failed,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: any) {
    console.error("Broadcast error:", err?.message || err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
