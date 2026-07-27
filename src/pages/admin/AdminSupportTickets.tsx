import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { ChatbotNav } from "@/components/admin/ChatbotNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, GraduationCap, Send, Headset } from "lucide-react";

type Ticket = Record<string, any>;

const STATUSES = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

export default function AdminSupportTickets() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [active, setActive] = useState<Ticket | null>(null);
  const [answer, setAnswer] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("support_tickets").select("*").order("created_at", { ascending: false }).limit(300);
    setTickets(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("chatbot-admin", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const reply = async () => {
    if (!active || !answer.trim()) return;
    setBusy(true);
    try {
      await call({ action: "reply", ticketId: active.id, answer: answer.trim(), sendEmail });
      toast({ title: "Reply sent" });
      setActive(null);
      setAnswer("");
      load();
    } catch (e: any) {
      toast({ title: "Failed to send reply", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const approveLearning = async (ticket: Ticket) => {
    if (!confirm("Create a published Knowledge Base article from this answer?")) return;
    try {
      await call({ action: "learn", ticketId: ticket.id });
      toast({ title: "Added to the Knowledge Base" });
      load();
    } catch (e: any) {
      toast({ title: "Could not approve for learning", description: e.message, variant: "destructive" });
    }
  };

  const takeover = async (ticket: Ticket, on: boolean) => {
    if (!ticket.conversation_id) return;
    try {
      await call({ action: "takeover", conversationId: ticket.conversation_id, active: on });
      toast({ title: on ? "You have joined the chat — the AI is paused" : "You left the chat — the AI resumes" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    await (supabase as any).from("support_tickets").update(patch).eq("id", id);
    load();
  };

  const filtered = tickets.filter((t) => {
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const hay = `${t.question} ${t.author_name} ${t.author_email} ${t.reference_number} ${t.category}`.toLowerCase();
    return matchesStatus && (!search || hay.includes(search.toLowerCase()));
  });

  return (
    <DashboardLayout type="admin">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Support Tickets</h1>
        <p className="text-muted-foreground mb-6">
          Questions the assistant escalated. Answering here replies in the author's chat.
        </p>
        <ChatbotNav />

        <div className="flex flex-wrap gap-2 mb-4">
          <Input className="max-w-xs" placeholder="Search question, name, email, reference…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {filtered.map((t) => (
              <GlassCard key={t.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant={t.status === "open" ? "destructive" : "secondary"}>{t.status}</Badge>
                      <Badge variant="outline">{t.priority}</Badge>
                      {t.category && <Badge variant="outline">{t.category}</Badge>}
                      {t.learned && <Badge>learned</Badge>}
                      <span className="text-xs text-muted-foreground">
                        AI confidence {Math.round((t.ai_confidence ?? 0) * 100)}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="font-medium">{t.question}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {[t.author_name, t.author_email, t.reference_number].filter(Boolean).join(" · ") || "Anonymous visitor"}
                    </p>
                    {t.human_answer && (
                      <p className="text-sm mt-2 border-l-2 border-primary pl-3">{t.human_answer}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => { setActive(t); setAnswer(t.human_answer || t.ai_suggested_answer || ""); }} className="gap-2">
                      <Send className="w-4 h-4" /> Reply
                    </Button>
                    {t.human_answer && !t.learned && (
                      <Button size="sm" variant="outline" onClick={() => approveLearning(t)} className="gap-2">
                        <GraduationCap className="w-4 h-4" /> Approve for AI learning
                      </Button>
                    )}
                    {t.conversation_id && (
                      <Button size="sm" variant="outline" onClick={() => takeover(t, true)} className="gap-2">
                        <Headset className="w-4 h-4" /> Join chat
                      </Button>
                    )}
                    <Select value={t.priority} onValueChange={(v) => update(t.id, { priority: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={t.status} onValueChange={(v) => update(t.id, { status: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </GlassCard>
            ))}
            {filtered.length === 0 && <p className="text-muted-foreground text-center py-10">No tickets found.</p>}
          </div>
        )}

        <Dialog open={!!active} onOpenChange={(v) => { if (!v) { setActive(null); setAnswer(""); } }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Reply to author</DialogTitle></DialogHeader>
            {active && (
              <div className="space-y-3">
                <div className="text-sm">
                  <p className="font-medium">{active.question}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {[active.author_name, active.author_email, active.reference_number].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {Array.isArray(active.transcript) && active.transcript.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border p-3 space-y-2 text-xs">
                    {active.transcript.map((m: any, i: number) => (
                      <p key={i}><span className="font-semibold">{m.role}:</span> {m.content}</p>
                    ))}
                  </div>
                )}
                {active.ai_suggested_answer && (
                  <div className="text-xs text-muted-foreground border-l-2 pl-3">
                    AI draft: {active.ai_suggested_answer}
                  </div>
                )}
                <div>
                  <Label>Your answer</Label>
                  <Textarea rows={8} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
                  <span className="text-sm">Also email this reply to the author</span>
                </div>
                <Button onClick={reply} disabled={busy || !answer.trim()} className="w-full gradient-primary">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Send reply
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
