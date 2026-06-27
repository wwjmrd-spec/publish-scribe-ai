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

export default function AdminEmailKB() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ai_knowledge_base").select("*").order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.title || !editing?.content) {
      toast({ title: "Missing fields", description: "Title and content are required", variant: "destructive" });
      return;
    }
    const payload = {
      title: editing.title,
      content: editing.content,
      category: editing.category || null,
      keywords: typeof editing.keywords === "string"
        ? editing.keywords.split(",").map((s: string) => s.trim()).filter(Boolean)
        : editing.keywords || [],
      is_active: editing.is_active ?? true,
    };
    if (editing.id) {
      await supabase.from("ai_knowledge_base").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("ai_knowledge_base").insert(payload);
    }
    setOpen(false);
    setEditing(null);
    toast({ title: "Saved" });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    await supabase.from("ai_knowledge_base").delete().eq("id", id);
    await load();
  };

  const filtered = items.filter(i => !search || `${i.title} ${i.content} ${i.category}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout type="admin">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Knowledge Base</h1>
        <p className="text-muted-foreground mb-6">The AI searches these entries before generating a reply.</p>
        <EmailAssistantNav active="/admin/email-assistant/knowledge" />

        <div className="flex gap-2 mb-4">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button className="gap-2" onClick={() => setEditing({ is_active: true })}><Plus className="w-4 h-4" /> New Entry</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} KB Entry</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Title" value={editing?.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                <Input placeholder="Category (e.g. Publication Process)" value={editing?.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
                <Input placeholder="Keywords (comma-separated)"
                  value={Array.isArray(editing?.keywords) ? editing.keywords.join(", ") : (editing?.keywords || "")}
                  onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} />
                <Textarea rows={10} placeholder="Content / answer the AI should use" value={editing?.content || ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
                <div className="flex items-center gap-2"><Switch checked={editing?.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><span className="text-sm">Active</span></div>
                <Button onClick={save} className="gap-2"><Save className="w-4 h-4" /> Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          : filtered.length === 0 ? <GlassCard className="p-8 text-center text-muted-foreground">No entries yet.</GlassCard>
            : <div className="space-y-2">
              {filtered.map(i => (
                <GlassCard key={i.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{i.title}</span>
                        {i.category && <Badge variant="outline">{i.category}</Badge>}
                        {!i.is_active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-2">{i.content}</div>
                      {i.keywords?.length > 0 && <div className="text-xs text-muted-foreground mt-1">Keywords: {i.keywords.join(", ")}</div>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditing({ ...i, keywords: (i.keywords || []).join(", ") }); setOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => remove(i.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>}
      </div>
    </DashboardLayout>
  );
}
