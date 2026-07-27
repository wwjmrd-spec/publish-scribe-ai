import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { ChatbotNav } from "@/components/admin/ChatbotNav";
import { Loader2 } from "lucide-react";

interface Stats {
  totalChats: number;
  resolvedChats: number;
  pendingChats: number;
  kbCount: number;
  faqCount: number;
  escalationRate: number;
  avgAiMs: number;
  avgHumanMinutes: number;
  satisfaction: number;
  topQuestions: { q: string; n: number }[];
  topKeywords: { w: string; n: number }[];
  mostUsedAnswers: { title: string; n: number }[];
}

const STOP = new Set(["what", "when", "where", "which", "there", "about", "would", "could", "should", "please", "article", "my", "the", "for", "and", "how", "can", "you", "with", "this", "that", "from", "have", "does"]);

export default function AdminChatbotAnalytics() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase as any;
      const [convs, logs, tickets, kb, faq] = await Promise.all([
        sb.from("chat_conversations").select("id,status,satisfaction,created_at").limit(5000),
        sb.from("chat_ai_logs").select("question,confidence,escalated,latency_ms,retrieved_ids").limit(5000),
        sb.from("support_tickets").select("created_at,answered_at,status").limit(5000),
        sb.from("ai_knowledge_base").select("id,title,status").limit(2000),
        sb.from("ai_faq").select("id,status").limit(2000),
      ]);

      const conversations = convs.data ?? [];
      const aiLogs = logs.data ?? [];
      const tks = tickets.data ?? [];
      const kbRows = kb.data ?? [];

      const escalated = aiLogs.filter((l: any) => l.escalated).length;
      const ratings = conversations.filter((c: any) => c.satisfaction != null);
      const answered = tks.filter((t: any) => t.answered_at);

      const counts = new Map<string, number>();
      const words = new Map<string, number>();
      for (const l of aiLogs) {
        const q = String(l.question ?? "").trim().toLowerCase();
        if (q) counts.set(q, (counts.get(q) ?? 0) + 1);
        for (const w of q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
          if (w.length > 3 && !STOP.has(w)) words.set(w, (words.get(w) ?? 0) + 1);
        }
      }

      const usage = new Map<string, number>();
      for (const l of aiLogs) {
        for (const id of (l.retrieved_ids ?? []) as string[]) usage.set(id, (usage.get(id) ?? 0) + 1);
      }
      const titleById = new Map<string, string>(kbRows.map((r: any) => [r.id as string, String(r.title ?? "")]));

      const top = (m: Map<string, number>, n = 8) =>
        [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

      setStats({
        totalChats: conversations.length,
        resolvedChats: conversations.filter((c: any) => c.status === "resolved").length,
        pendingChats: tks.filter((t: any) => t.status === "open").length,
        kbCount: kbRows.filter((r: any) => r.status === "published").length,
        faqCount: (faq.data ?? []).filter((r: any) => r.status === "published").length,
        escalationRate: aiLogs.length ? Math.round((escalated / aiLogs.length) * 100) : 0,
        avgAiMs: aiLogs.length ? Math.round(aiLogs.reduce((s: number, l: any) => s + (l.latency_ms ?? 0), 0) / aiLogs.length) : 0,
        avgHumanMinutes: answered.length
          ? Math.round(answered.reduce((s: number, t: any) =>
              s + (new Date(t.answered_at).getTime() - new Date(t.created_at).getTime()) / 60000, 0) / answered.length)
          : 0,
        satisfaction: ratings.length
          ? Math.round((ratings.filter((c: any) => c.satisfaction > 0).length / ratings.length) * 100)
          : 0,
        topQuestions: top(counts).map(([q, n]) => ({ q, n })),
        topKeywords: top(words, 12).map(([w, n]) => ({ w, n })),
        mostUsedAnswers: top(usage).map(([id, n]) => ({ title: titleById.get(id) ?? "FAQ entry", n })),
      });
    })();
  }, []);

  if (!stats) {
    return (
      <DashboardLayout type="admin">
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      </DashboardLayout>
    );
  }

  const cards = [
    { label: "Total chats", value: stats.totalChats },
    { label: "Resolved chats", value: stats.resolvedChats },
    { label: "Pending tickets", value: stats.pendingChats },
    { label: "Published KB articles", value: stats.kbCount },
    { label: "Published FAQs", value: stats.faqCount },
    { label: "Escalation rate", value: `${stats.escalationRate}%` },
    { label: "Avg AI response", value: `${(stats.avgAiMs / 1000).toFixed(1)}s` },
    { label: "Avg human response", value: `${stats.avgHumanMinutes} min` },
    { label: "Satisfaction", value: `${stats.satisfaction}%` },
  ];

  return (
    <DashboardLayout type="admin">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Chatbot Analytics</h1>
        <p className="text-muted-foreground mb-6">Assistant performance and Knowledge Base coverage.</p>
        <ChatbotNav />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {cards.map((c) => (
            <GlassCard key={c.label} className="p-4">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold mt-1">{c.value}</p>
            </GlassCard>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <GlassCard className="p-4">
            <h2 className="font-semibold mb-3">Most asked questions</h2>
            {stats.topQuestions.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
            <ul className="space-y-1 text-sm">
              {stats.topQuestions.map((q) => (
                <li key={q.q} className="flex justify-between gap-3">
                  <span className="truncate">{q.q}</span>
                  <span className="text-muted-foreground">{q.n}</span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard className="p-4">
            <h2 className="font-semibold mb-3">Most used Knowledge Base answers</h2>
            {stats.mostUsedAnswers.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
            <ul className="space-y-1 text-sm">
              {stats.mostUsedAnswers.map((a) => (
                <li key={a.title} className="flex justify-between gap-3">
                  <span className="truncate">{a.title}</span>
                  <span className="text-muted-foreground">{a.n}</span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard className="p-4 md:col-span-2">
            <h2 className="font-semibold mb-3">Top keywords</h2>
            <div className="flex flex-wrap gap-2">
              {stats.topKeywords.map((k) => (
                <span key={k.w} className="text-xs px-2 py-1 rounded-full border border-[hsl(var(--glass-border))]">
                  {k.w} · {k.n}
                </span>
              ))}
              {stats.topKeywords.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
            </div>
          </GlassCard>
        </div>
      </div>
    </DashboardLayout>
  );
}
