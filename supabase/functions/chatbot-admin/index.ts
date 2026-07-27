// Admin-side actions for the support chatbot:
//   action: "reply"        -> store human answer, post it into the chat, optionally email
//   action: "learn"        -> create a published KB article from a ticket's Q/A (admin approved)
//   action: "takeover"     -> admin joins / leaves a conversation (AI pauses / resumes)
//
// Requires an authenticated admin.

import { createClient } from "npm:@supabase/supabase-js@2";
import { embedText, toVectorLiteral } from "../_shared/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: userData } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    const admin = userData?.user;
    if (!admin) return json({ error: "Not authenticated" }, 401);

    const { data: roleRow } = await sb.from("user_roles")
      .select("role").eq("user_id", admin.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    const body = await req.json();
    const action = body.action as string;

    // ---------------------------------------------------------------- reply
    if (action === "reply") {
      const { ticketId, answer, sendEmail } = body;
      if (!ticketId || !answer) return json({ error: "ticketId and answer are required" }, 400);

      const { data: ticket, error } = await sb.from("support_tickets")
        .select("*").eq("id", ticketId).maybeSingle();
      if (error || !ticket) return json({ error: "Ticket not found" }, 404);

      await sb.from("support_tickets").update({
        human_answer: answer,
        answered_at: new Date().toISOString(),
        answered_by: admin.id,
        status: "resolved",
      }).eq("id", ticketId);

      if (ticket.conversation_id) {
        await sb.from("chat_messages").insert({
          conversation_id: ticket.conversation_id,
          role: "assistant",
          content: answer,
          confidence: 1,
        });
        await sb.from("chat_conversations").update({ status: "resolved" }).eq("id", ticket.conversation_id);
      }

      if (ticket.user_id) {
        await sb.from("notifications").insert({
          user_id: ticket.user_id,
          title: "Support replied to your question 💬",
          message: answer.slice(0, 200),
          type: "info",
          link: "/author",
        });
      }

      if (sendEmail && ticket.author_email) {
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              to: ticket.author_email,
              subject: "Re: your question to WWJMRD Support",
              html: `<p>Dear ${ticket.author_name ?? "Author"},</p><p>${answer.replace(/\n/g, "<br/>")}</p><p>— WWJMRD Support</p>`,
              email_type: "support_reply",
            }),
          });
        } catch (e) {
          console.error("support reply email failed", e);
        }
      }

      return json({ success: true });
    }

    // ---------------------------------------------------------------- learn
    if (action === "learn") {
      const { ticketId, title, category } = body;
      const { data: ticket } = await sb.from("support_tickets")
        .select("*").eq("id", ticketId).maybeSingle();
      if (!ticket) return json({ error: "Ticket not found" }, 404);
      if (!ticket.human_answer) return json({ error: "Answer the ticket before approving it for AI learning" }, 400);

      const keywords = String(ticket.question).toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
        .filter((w) => w.length > 4).slice(0, 10);

      const { data: kb, error } = await sb.from("ai_knowledge_base").insert({
        title: title || String(ticket.question).slice(0, 120),
        question: ticket.question,
        content: ticket.human_answer,
        category: category || ticket.category || "support",
        keywords,
        status: "published",
        is_active: true,
        created_by: admin.id,
      }).select("id").single();
      if (error) throw error;

      try {
        const vec = await embedText(`${ticket.question}\n${ticket.human_answer}`);
        await sb.from("ai_knowledge_base").update({ embedding: toVectorLiteral(vec) }).eq("id", kb.id);
      } catch (e) {
        console.error("learn embedding failed", e);
      }

      await sb.from("support_tickets").update({ learned: true, status: "closed" }).eq("id", ticketId);
      return json({ success: true, knowledgeBaseId: kb.id });
    }

    // ------------------------------------------------------------- takeover
    if (action === "takeover") {
      const { conversationId, active } = body;
      if (!conversationId) return json({ error: "conversationId is required" }, 400);
      await sb.from("chat_conversations").update({
        human_takeover: !!active,
        assigned_admin: active ? admin.id : null,
      }).eq("id", conversationId);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("chatbot-admin error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
