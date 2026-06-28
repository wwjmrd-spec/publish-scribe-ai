import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2, RefreshCw, Inbox as InboxIcon, FileEdit, BookOpen, HelpCircle, Settings as SettingsIcon, Mail, Sparkles } from "lucide-react";
import { SimplePager } from "@/components/ui/SimplePager";

const NAV = [
  { to: "/admin/email-assistant", label: "Inbox", icon: InboxIcon },
  { to: "/admin/email-assistant/drafts", label: "Drafts", icon: FileEdit },
  { to: "/admin/email-assistant/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/admin/email-assistant/faq", label: "FAQ", icon: HelpCircle },
  { to: "/admin/email-assistant/settings", label: "Settings", icon: SettingsIcon },
];

export function EmailAssistantNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {NAV.map(n => {
        const Icon = n.icon;
        const isActive = n.to === active;
        return (
          <Link key={n.to} to={n.to}>
            <Button variant={isActive ? "default" : "outline"} size="sm" className="gap-2">
              <Icon className="w-4 h-4" /> {n.label}
            </Button>
          </Link>
        );
      })}
    </div>
  );
}

export default function AdminEmailAssistant() {
  const { toast } = useToast();
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, drafted: 0, pending: 0, replied: 0 });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ai_emails")
      .select("id,subject,from_name,from_email,received_at,status,is_read,snippet,zoho_thread_id")
      .order("received_at", { ascending: false }).limit(200);
    setEmails(data || []);

    const { data: drafts } = await supabase.from("ai_draft_replies").select("status");
    const pending = (drafts || []).filter((d: any) => d.status === "pending").length;
    const approved = (drafts || []).filter((d: any) => d.status === "approved").length;
    setStats({
      total: data?.length || 0,
      drafted: (data || []).filter((e: any) => e.status === "drafted").length,
      pending,
      replied: approved,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const { data, error } = await supabase.functions.invoke("zoho-fetch-inbox", { body: {} });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Zoho inbox sync failed");
      toast({ title: "Inbox synced", description: `${data?.inserted ?? 0} new email(s) imported.` });
      await load();
    } catch (e: any) {
      const message = String(e?.message || e);
      setSyncError(message);
      toast({ title: "Zoho sync needs attention", description: message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = emails.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.subject || "").toLowerCase().includes(q) ||
      (e.from_email || "").toLowerCase().includes(q) ||
      (e.from_name || "").toLowerCase().includes(q);
  });
  const pageSize = 10;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardLayout type="admin">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="w-7 h-7 text-primary" /> AI Email Assistant</h1>
          <Button onClick={sync} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Inbox
          </Button>
        </div>
        <p className="text-muted-foreground mb-6">Reads Zoho Mail inbox, generates AI drafts. Nothing is sent automatically.</p>

        <EmailAssistantNav active="/admin/email-assistant" />

        {syncError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Zoho connection needs to be reconnected</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{syncError}</p>
              <div className="text-sm">
                Generate a new Zoho Self Client refresh token in the same data center and update the saved <strong>ZOHO_MAIL_REFRESH_TOKEN</strong> secret. Make sure the scopes are <strong>ZohoMail.accounts.READ</strong>, <strong>ZohoMail.messages.READ</strong>, and <strong>ZohoMail.folders.READ</strong>.
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/email-assistant/settings">Check Zoho settings</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <GlassCard className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold">{stats.total}</div></GlassCard>
          <GlassCard className="p-4"><div className="text-xs text-muted-foreground">Drafted</div><div className="text-2xl font-bold">{stats.drafted}</div></GlassCard>
          <GlassCard className="p-4"><div className="text-xs text-muted-foreground">Pending Review</div><div className="text-2xl font-bold">{stats.pending}</div></GlassCard>
          <GlassCard className="p-4"><div className="text-xs text-muted-foreground">Approved</div><div className="text-2xl font-bold">{stats.replied}</div></GlassCard>
        </div>

        <GlassCard className="p-4 mb-4">
          <Input placeholder="Search subject or sender…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </GlassCard>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : paged.length === 0 ? (
          <GlassCard className="p-10 text-center text-muted-foreground">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-50" />
            No emails yet. Click <strong>Sync Inbox</strong> to import from Zoho.
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {paged.map(e => (
              <Link key={e.id} to={`/admin/email-assistant/drafts?email=${e.id}`}>
                <GlassCard className="p-4 hover:bg-primary/5 transition cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{e.subject || "(no subject)"}</div>
                      <div className="text-sm text-muted-foreground truncate">{e.from_name} &lt;{e.from_email}&gt;</div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.snippet}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={e.status === "drafted" ? "default" : "secondary"}>{e.status}</Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {e.received_at ? new Date(e.received_at).toLocaleString() : ""}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
            <SimplePager page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
