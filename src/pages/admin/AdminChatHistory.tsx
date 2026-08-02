import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { ChatbotNav } from "@/components/admin/ChatbotNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Trash2, Eye, RotateCcw, MessageSquare } from "lucide-react";

type Conversation = Record<string, any>;
type Message = Record<string, any>;

const DELETE_LABEL: Record<string, string> = {
  all: "Hidden from everyone",
  admin: "Hidden from admins",
  author: "Hidden from the author",
};

export default function AdminChatHistory() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Conversation[]>([]);
  const [names, setNames] = useState<Record<string, { name: string; email: string }>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const load = async () => {
    setLoading(true);
    const sb = supabase as any;
    const { data } = await sb
      .from("chat_conversations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    const convs: Conversation[] = data || [];
    setRows(convs);

    const userIds = [...new Set(convs.map((c) => c.user_id).filter(Boolean))] as string[];
    if (userIds.length) {
      const { data: profiles } = await sb.from("profiles").select("id,full_name,email").in("id", userIds);
      const map: Record<string, { name: string; email: string }> = {};
      for (const p of profiles || []) map[p.id] = { name: p.full_name, email: p.email };
      setNames(map);
    }

    const ids = convs.map((c) => c.id);
    if (ids.length) {
      const { data: msgs } = await sb
        .from("chat_messages")
        .select("conversation_id")
        .in("conversation_id", ids)
        .limit(20000);
      const c: Record<string, number> = {};
      for (const m of msgs || []) c[m.conversation_id] = (c[m.conversation_id] ?? 0) + 1;
      setCounts(c);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openChat = async (conv: Conversation) => {
    setActive(conv);
    setLoadingMessages(true);
    const { data } = await (supabase as any)
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    setLoadingMessages(false);
  };

  const setDeletion = async (conv: Conversation, mode: "none" | "all" | "admin" | "author") => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("chat_conversations")
      .update({
        deleted_for: mode,
        deleted_at: mode === "none" ? null : new Date().toISOString(),
        deleted_by: mode === "none" ? null : userData?.user?.id ?? null,
      })
      .eq("id", conv.id);
    if (error) {
      toast({ title: "Could not update this chat", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title:
        mode === "none"
          ? "Chat restored for everyone"
          : mode === "all"
            ? "Chat deleted for everyone"
            : mode === "admin"
              ? "Chat hidden from the admin panel"
              : "Chat deleted for the author only",
    });
    if (active?.id === conv.id) setActive(null);
    load();
  };

  const who = (c: Conversation) => {
    const p = c.user_id ? names[c.user_id] : undefined;
    return {
      name: p?.name || c.author_name || "Anonymous visitor",
      email: p?.email || c.author_email || "—",
    };
  };

  const filtered = rows.filter((c) => {
    if (!showHidden && (c.deleted_for === "all" || c.deleted_for === "admin")) return false;
    if (!search) return true;
    const { name, email } = who(c);
    const hay = `${name} ${email} ${c.reference_number ?? ""} ${c.channel ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  return (
    <DashboardLayout type="admin">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Chat History</h1>
        <p className="text-muted-foreground mb-6">
          Every support chat authors and visitors had with the assistant, with their name and email.
        </p>
        <ChatbotNav />

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input
            className="max-w-xs"
            placeholder="Search name, email, reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Switch checked={showHidden} onCheckedChange={setShowHidden} />
            <span className="text-sm">Show deleted chats</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => {
              const { name, email } = who(c);
              return (
                <GlassCard key={c.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline">{c.channel}</Badge>
                        <Badge variant={c.status === "resolved" ? "secondary" : "destructive"}>{c.status}</Badge>
                        {c.human_takeover && <Badge>human takeover</Badge>}
                        {c.deleted_for && c.deleted_for !== "none" && (
                          <Badge variant="destructive">{DELETE_LABEL[c.deleted_for]}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.updated_at || c.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[email, c.reference_number, c.country].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> {counts[c.id] ?? 0} messages
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="outline" onClick={() => openChat(c)} className="gap-2">
                        <Eye className="w-4 h-4" /> View chat
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="destructive" className="gap-2">
                            <Trash2 className="w-4 h-4" /> Delete
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDeletion(c, "all")}>
                            Delete for everyone
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeletion(c, "admin")}>
                            Delete for admin only
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeletion(c, "author")}>
                            Delete for author only
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {c.deleted_for && c.deleted_for !== "none" && (
                        <Button size="sm" variant="ghost" onClick={() => setDeletion(c, "none")} className="gap-2">
                          <RotateCcw className="w-4 h-4" /> Restore
                        </Button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-muted-foreground text-center py-10">No chats found.</p>
            )}
          </div>
        )}

        <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{active ? who(active).name : "Chat"}</DialogTitle>
            </DialogHeader>
            {active && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {[who(active).email, active.reference_number, active.channel].filter(Boolean).join(" · ")}
                </p>
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => (
                      <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                        <div
                          className={
                            m.role === "user"
                              ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
                              : "max-w-[85%] rounded-2xl rounded-tl-sm border border-[hsl(var(--glass-border))] px-3 py-2 text-sm whitespace-pre-wrap"
                          }
                        >
                          {m.content}
                          <div className="text-[10px] opacity-60 mt-1">
                            {new Date(m.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                    {messages.length === 0 && (
                      <p className="text-sm text-muted-foreground">No messages in this chat.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
