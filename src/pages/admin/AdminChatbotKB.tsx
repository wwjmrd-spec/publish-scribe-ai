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
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Copy, Download, Upload, RefreshCw } from "lucide-react";

const LANGUAGES = ["en", "hi", "fr", "es", "ar", "zh"];
const STATUSES = ["published", "draft", "archived"];

type Entry = Record<string, any>;

export default function AdminChatbotKB() {
  const { toast } = useToast();
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [embedding, setEmbedding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("ai_knowledge_base")
      .select("id,title,question,content,category,keywords,tags,priority,language,status,is_active,created_at,updated_at,embedding")
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toArray = (v: any) =>
    typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v || [];

  const save = async () => {
    if (!editing?.title || !editing?.content) {
      toast({ title: "Title and answer are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      title: editing.title,
      question: editing.question || null,
      content: editing.content,
      category: editing.category || null,
      keywords: toArray(editing.keywords),
      tags: toArray(editing.tags),
      priority: Number(editing.priority || 0),
      language: editing.language || "en",
      status: editing.status || "published",
      is_active: (editing.status || "published") === "published",
    };
    let id = editing.id;
    if (id) {
      await (supabase as any).from("ai_knowledge_base").update(payload).eq("id", id);
    } else {
      const { data } = await (supabase as any).from("ai_knowledge_base").insert(payload).select("id").single();
      id = data?.id;
    }
    // Re-embed so semantic search stays in sync with the edit.
    if (id) await supabase.functions.invoke("chatbot-embed", { body: { table: "ai_knowledge_base", id } });

    setSaving(false);
    setOpen(false);
    setEditing(null);
    toast({ title: "Saved" });
    load();
  };

  const setStatus = async (item: Entry, status: string) => {
    await (supabase as any).from("ai_knowledge_base")
      .update({ status, is_active: status === "published" }).eq("id", item.id);
    load();
  };

  const duplicate = async (item: Entry) => {
    const { id, created_at, updated_at, embedding, ...rest } = item;
    await (supabase as any).from("ai_knowledge_base")
      .insert({ ...rest, title: `${item.title} (copy)`, status: "draft", is_active: false });
    toast({ title: "Duplicated as draft" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this article?")) return;
    await (supabase as any).from("ai_knowledge_base").delete().eq("id", id);
    load();
  };

  const embedAll = async () => {
    setEmbedding(true);
    const { data, error } = await supabase.functions.invoke("chatbot-embed", {
      body: { table: "ai_knowledge_base", all: true },
    });
    setEmbedding(false);
    if (error) toast({ title: "Embedding failed", description: error.message, variant: "destructive" });
    else toast({ title: `Embedded ${data?.embedded ?? 0} articles` });
    load();
  };

  const exportJson = () => {
    const clean = items.map(({ embedding, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wwjmrd-knowledge-base-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const importJson = async (file: File) => {
    try {
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows)) throw new Error("File must contain an array");
      const payload = rows.map((r: Entry) => ({
        title: r.title,
        question: r.question ?? null,
        content: r.content,
        category: r.category ?? null,
        keywords: toArray(r.keywords),
        tags: toArray(r.tags),
        priority: Number(r.priority || 0),
        language: r.language || "en",
        status: r.status || "draft",
        is_active: (r.status || "draft") === "published",
      })).filter((r: Entry) => r.title && r.content);
      const { error } = await (supabase as any).from("ai_knowledge_base").insert(payload);
      if (error) throw error;
      toast({ title: `Imported ${payload.length} articles` });
      load();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    }
  };

  const filtered = items.filter((i) => {
    const matchesSearch = !search ||
      `${i.title} ${i.question} ${i.content} ${i.category} ${(i.keywords || []).join(" ")}`
        .toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout type="admin">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Chatbot Knowledge Base</h1>
        <p className="text-muted-foreground mb-6">
          Only <strong>published</strong> articles are used by the support assistant.
        </p>
        <ChatbotNav />

        <div className="flex flex-wrap gap-2 mb-4">
          <Input
            className="max-w-xs"
            placeholder="Search articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setEditing({ status: "published", language: "en", priority: 0 }); setOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> New Article
          </Button>
          <Button variant="outline" onClick={embedAll} disabled={embedding} className="gap-2">
            {embedding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Re-embed all
          </Button>
          <Button variant="outline" onClick={exportJson} className="gap-2">
            <Download className="w-4 h-4" /> Export
          </Button>
          <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md cursor-pointer hover:bg-[hsl(var(--glass-bg))]">
            <Upload className="w-4 h-4" /> Import
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
            />
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <GlassCard key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{item.title}</h3>
                      <Badge variant={item.status === "published" ? "default" : "secondary"}>{item.status}</Badge>
                      {item.category && <Badge variant="outline">{item.category}</Badge>}
                      <Badge variant="outline">{item.language}</Badge>
                      {!item.embedding && <Badge variant="destructive">not embedded</Badge>}
                    </div>
                    {item.question && <p className="text-sm text-muted-foreground mt-1">Q: {item.question}</p>}
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.content}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditing({ ...item, keywords: (item.keywords || []).join(", "), tags: (item.tags || []).join(", ") });
                      setOpen(true);
                    }}>Edit</Button>
                    {item.status !== "published" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(item, "published")}>Publish</Button>
                    )}
                    {item.status !== "archived" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(item, "archived")}>Archive</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => duplicate(item)}><Copy className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
              </GlassCard>
            ))}
            {filtered.length === 0 && (
              <p className="text-muted-foreground text-center py-10">No articles found.</p>
            )}
          </div>
        )}

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} Knowledge Base Article</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label>
                <Input value={editing?.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>Question</Label>
                <Input placeholder="The question authors typically ask"
                  value={editing?.question || ""} onChange={(e) => setEditing({ ...editing, question: e.target.value })} /></div>
              <div><Label>Answer *</Label>
                <Textarea rows={8} value={editing?.content || ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Category</Label>
                  <Input value={editing?.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
                <div><Label>Priority</Label>
                  <Input type="number" value={editing?.priority ?? 0} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} /></div>
              </div>
              <div><Label>Keywords (comma separated)</Label>
                <Input value={editing?.keywords || ""} onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} /></div>
              <div><Label>Tags (comma separated)</Label>
                <Input value={editing?.tags || ""} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Language</Label>
                  <Select value={editing?.language || "en"} onValueChange={(v) => setEditing({ ...editing, language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label>Status</Label>
                  <Select value={editing?.status || "published"} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select></div>
              </div>
              <Button onClick={save} disabled={saving} className="w-full gradient-primary">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save & embed
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
