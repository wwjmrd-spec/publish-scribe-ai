import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmailAssistantNav } from "./AdminEmailAssistant";

export default function AdminEmailFAQ() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ai_faq").select("*").order("created_at", { ascending: false });
    setItems(data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.question || !editing?.answer) {
      toast({ title: "Missing fields", description: "Question and answer required", variant: "destructive" }); return;
    }
    const payload = {
      question: editing.question,
      answer: editing.answer,
      category: editing.category || null,
      keywords: typeof editing.keywords === "string"
        ? editing.keywords.split(",").map((s: string) => s.trim()).filter(Boolean) : (editing.keywords || []),
      is_active: editing.is_active ?? true,
    };
    if (editing.id) await supabase.from("ai_faq").update(payload).eq("id", editing.id);
    else await supabase.from("ai_faq").insert(payload);
    setOpen(false); setEditing(null); toast({ title: "Saved" }); await load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this FAQ?")) return;
    await supabase.from("ai_faq").delete().eq("id", id); await load();
  };
  const filtered = items.filter(i => !search || `${i.question} ${i.answer} ${i.category}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout type="admin">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">FAQ</h1>
        <p className="text-muted-foreground mb-6">Frequently asked questions and answers the AI should use.</p>
        <EmailAssistantNav active="/admin/email-assistant/faq" />

        <div className="flex gap-2 mb-4">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button className="gap-2" onClick={() => setEditing({ is_active: true })}><Plus className="w-4 h-4" /> New FAQ</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} FAQ</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Question" value={editing?.question || ""} onChange={(e) => setEditing({ ...editing, question: e.target.value })} />
                <Textarea rows={6} placeholder="Answer" value={editing?.answer || ""} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
                <Input placeholder="Category" value={editing?.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
                <Input placeholder="Keywords (comma-separated)"
                  value={Array.isArray(editing?.keywords) ? editing.keywords.join(", ") : (editing?.keywords || "")}
                  onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} />
                <div className="flex items-center gap-2"><Switch checked={editing?.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><span className="text-sm">Active</span></div>
                <Button onClick={save} className="gap-2"><Save className="w-4 h-4" /> Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          : filtered.length === 0 ? <GlassCard className="p-8 text-center text-muted-foreground">No FAQs yet.</GlassCard>
            : <div className="space-y-2">{filtered.map(i => (
              <GlassCard key={i.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{i.question}</span>
                      {i.category && <Badge variant="outline">{i.category}</Badge>}
                      {!i.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-2">{i.answer}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing({ ...i, keywords: (i.keywords || []).join(", ") }); setOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(i.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </GlassCard>
            ))}</div>}
      </div>
    </DashboardLayout>
  );
}
