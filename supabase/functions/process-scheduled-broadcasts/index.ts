import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const { data: due, error } = await admin
      .from("scheduled_broadcasts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(20);

    if (error) throw error;

    const processed: any[] = [];

    for (const job of due || []) {
      // mark processing
      await admin
        .from("scheduled_broadcasts")
        .update({ status: "processing" })
        .eq("id", job.id)
        .eq("status", "pending");

      try {
        const { data: sendData, error: sendErr } = await admin.functions.invoke("send-broadcast-internal", {
          body: {
            title: job.title,
            message: job.message,
            type: job.notification_type,
            link: job.link,
            recipients: job.recipients,
            send_email: job.send_email,
            email_provider_override: job.email_provider_override || undefined,
            email_from: job.email_from || undefined,
            article_status_context: job.article_status_context || undefined,
            __internal_admin_id: job.created_by,
          },
        });
        if (sendErr || (sendData as any)?.error) {
          throw new Error(sendErr?.message || (sendData as any)?.error || "send failed");
        }
        await admin
          .from("scheduled_broadcasts")
          .update({
            status: "sent",
            processed_at: new Date().toISOString(),
            notifications_sent: (sendData as any)?.notifications_sent ?? null,
            emails_sent: (sendData as any)?.emails_sent ?? null,
            emails_failed: (sendData as any)?.emails_failed ?? null,
          })
          .eq("id", job.id);
        processed.push({ id: job.id, ok: true });
      } catch (e: any) {
        await admin
          .from("scheduled_broadcasts")
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
            error_message: e?.message || "unknown error",
          })
          .eq("id", job.id);
        processed.push({ id: job.id, ok: false, error: e?.message });
      }
    }

    return new Response(JSON.stringify({ processed_count: processed.length, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("process-scheduled-broadcasts error", err);
    return new Response(JSON.stringify({ error: err?.message || "internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
