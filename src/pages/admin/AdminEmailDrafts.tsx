import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Copy, CheckCircle2, Trash2, RotateCw, ArrowLeft } from "lucide-react";
import { EmailAssistantNav } from "./AdminEmailAssistant";

export default function AdminEmailDrafts() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const focusedEmailId = params.get("email");
  const [drafts, setDrafts] = useState<any[]>([]);
  const [emails, setEmails] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: ds } = await supabase.from("ai_draft_replies").select("*").order("created_at", { ascending: false }).limit(100);
    setDrafts(ds || []);
    const emailIds = Array.from(new Set((ds || []).map((d: any) => d.email_id))).filter(Boolean);
    if (emailIds.length) {
      const { data: es } = await supabase.from("ai_emails").select("id,subject,from_name,from_email,received_at,body_text,snippet").in("id", emailIds);
      const map: Record<string, any> = {};
      (es || []).forEach((e: any) => { map[e.id] = e; });
      setEmails(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (focusedEmailId && drafts.length) {
      const d = drafts.find(x => x.email_id === focusedEmailId);
      if (d) setSelectedId(d.id);
      else generateForEmail(focusedEmailId);
    }
  }, [focusedEmailId, drafts.length]);

  const selected = drafts.find(d => d.id === selectedId);

  useEffect(() => {
    if (selected) {
      setEditSubject(selected.subject || "");
      setEditBody(selected.body || "");
    }
  }, [selectedId]);

  const generateForEmail = async (emailId: string, regenerate = false) => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("ai-email-draft", { body: { email_id: emailId, regenerate } });
      if (error) throw error;
      toast({ title: "Draft generated" });
      await load();
    } catch (e: any) {
      toast({ title: "Generation failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    await supabase.from("ai_draft_replies").update({ subject: editSubject, body: editBody, status: "edited" }).eq("id", selected.id);
    setBusy(false);
    toast({ title: "Draft saved" });
    await load();
  };

  const approve = async () => {
    if (!selected) return;
    setBusy(true);
    await supabase.from("ai_draft_replies").update({
      subject: editSubject, body: editBody, status: "approved", approved_at: new Date().toISOString(),
    }).eq("id", selected.id);
    setBusy(false);
    toast({ title: "Approved", description: "Marked as approved. Sending will be enabled in a later phase." });
    await load();
  };

  const remove = async () => {
    if (!selected) return;
    await supabase.from("ai_draft_replies").delete().eq("id", selected.id);
    setSelectedId(null);
    toast({ title: "Draft deleted" });
    await load();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`Subject: ${editSubject}\n\n${editBody}`);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <DashboardLayout type="admin">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2"><Sparkles className="w-7 h-7 text-primary" /> Draft Replies</h1>
        <p className="text-muted-foreground mb-6">Review, edit, and approve AI-generated draft replies.</p>
        <EmailAssistantNav active="/admin/email-assistant/drafts" />

        <div className="grid lg:grid-cols-[1fr,2fr] gap-4">
          <GlassCard className="p-3 max-h-[75vh] overflow-y-auto">
            {loading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
              : drafts.length === 0 ? <div className="text-sm text-muted-foreground p-4">No drafts yet.</div>
                : drafts.map(d => {
                  const e = emails[d.email_id];
                  const active = d.id === selectedId;
                  return (
                    <button key={d.id} onClick={() => setSelectedId(d.id)}
                      className={`w-full text-left p-3 rounded-lg mb-2 transition ${active ? "bg-primary/15 border border-primary/30" : "hover:bg-primary/5"}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-medium truncate">{e?.from_name || e?.from_email || "Unknown"}</span>
                        <Badge variant={d.status === "approved" ? "default" : "secondary"} className="text-[10px]">{d.status}</Badge>
                      </div>
                      <div className="text-sm truncate">{d.subject}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{d.category}</span>
                        <span>·</span>
                        <span>{d.confidence}% {d.confidence_label}</span>
                      </div>
                    </button>
                  );
                })}
          </GlassCard>

          <div>
            {!selected ? (
              <GlassCard className="p-10 text-center text-muted-foreground">Select a draft on the left, or open an email from the Inbox.</GlassCard>
            ) : (
              <div className="space-y-4">
                {focusedEmailId && (
                  <Button variant="ghost" size="sm" onClick={() => setParams({})} className="gap-1"><ArrowLeft className="w-4 h-4" /> Back</Button>
                )}
                <GlassCard className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Original email</div>
                  <div className="font-medium">{emails[selected.email_id]?.subject}</div>
                  <div className="text-sm text-muted-foreground">{emails[selected.email_id]?.from_name} &lt;{emails[selected.email_id]?.from_email}&gt;</div>
                  <div className="text-sm mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap">{emails[selected.email_id]?.body_text}</div>
                </GlassCard>

                <GlassCard className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge>{selected.category}</Badge>
                      <Badge variant="outline">{selected.confidence}% — {selected.confidence_label}</Badge>
                      <Badge variant="outline">{selected.language}</Badge>
                    </div>
                  </div>
                  <label className="text-xs text-muted-foreground">Subject</label>
                  <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="mb-3" />
                  <label className="text-xs text-muted-foreground">Body</label>
                  <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={14} className="font-mono text-sm" />

                  {selected.reasoning && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      <strong>Reasoning:</strong> {selected.reasoning}
                    </div>
                  )}
                  {selected.sources?.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <strong>Sources:</strong> {selected.sources.join(", ")}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button onClick={save} disabled={busy} variant="outline" className="gap-2"><FileEditIcon /> Save Edit</Button>
                    <Button onClick={approve} disabled={busy} className="gap-2"><CheckCircle2 className="w-4 h-4" /> Approve</Button>
                    <Button onClick={copyToClipboard} variant="outline" className="gap-2"><Copy className="w-4 h-4" /> Copy</Button>
                    <Button onClick={() => generateForEmail(selected.email_id, true)} disabled={busy} variant="outline" className="gap-2">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                      Regenerate
                    </Button>
                    <Button onClick={remove} variant="destructive" className="gap-2"><Trash2 className="w-4 h-4" /> Delete</Button>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground italic">Sending is intentionally disabled in this phase. Copy or approve and send manually.</div>
                </GlassCard>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function FileEditIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13.5V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2h-5.5"/><polyline points="14 2 14 8 20 8"/><path d="M10.42 12.61a2.1 2.1 0 1 1 2.97 2.97L7.95 21 4 22l.99-3.95 5.43-5.44Z"/></svg>;
}
