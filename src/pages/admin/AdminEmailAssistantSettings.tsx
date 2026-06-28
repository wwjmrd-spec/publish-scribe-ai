import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { EmailAssistantNav } from "./AdminEmailAssistant";

export default function AdminEmailAssistantSettings() {
  const { toast } = useToast();
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("ai_email_settings").select("*").limit(1).maybeSingle();
      setS(data || {});
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload: any = {
      ai_enabled: s.ai_enabled ?? true,
      polling_interval_minutes: Number(s.polling_interval_minutes) || 5,
      default_language: s.default_language || "English",
      reply_tone: s.reply_tone || "professional",
      signature: s.signature || "",
      ai_instructions: s.ai_instructions || "",
      zoho_account_id: s.zoho_account_id || null,
      zoho_region: s.zoho_region || "com",
      zoho_client_id: s.zoho_client_id || null,
    };
    // Only overwrite secrets when admin entered a new value (avoid wiping when field is left blank)
    if (s.zoho_client_secret && String(s.zoho_client_secret).trim()) payload.zoho_client_secret = String(s.zoho_client_secret).trim();
    if (s.zoho_refresh_token && String(s.zoho_refresh_token).trim()) payload.zoho_refresh_token = String(s.zoho_refresh_token).trim();
    if (s.id) await supabase.from("ai_email_settings").update(payload).eq("id", s.id);
    else await supabase.from("ai_email_settings").insert(payload);
    setSaving(false);
    setS({ ...s, zoho_client_secret: "", zoho_refresh_token: "" });
    toast({ title: "Settings saved" });
  };

  if (loading) return <DashboardLayout type="admin"><div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div></DashboardLayout>;

  return (
    <DashboardLayout type="admin">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">AI Email Assistant Settings</h1>
        <p className="text-muted-foreground mb-6">Provider keys (Gemini, Zoho) are stored as encrypted secrets and configured server-side.</p>
        <EmailAssistantNav active="/admin/email-assistant/settings" />

        <GlassCard className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div><Label>AI Enabled</Label><p className="text-xs text-muted-foreground">Generate drafts for new emails automatically</p></div>
            <Switch checked={s.ai_enabled ?? true} onCheckedChange={(v) => setS({ ...s, ai_enabled: v })} />
          </div>
          <div>
            <Label>Polling interval (minutes)</Label>
            <Input type="number" min={1} value={s.polling_interval_minutes ?? 5} onChange={(e) => setS({ ...s, polling_interval_minutes: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">Cron is fixed at 5 min by default; changing this is informational unless you re-run the cron setup.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Default Language</Label><Input value={s.default_language || "English"} onChange={(e) => setS({ ...s, default_language: e.target.value })} /></div>
            <div><Label>Reply Tone</Label><Input value={s.reply_tone || "professional"} onChange={(e) => setS({ ...s, reply_tone: e.target.value })} /></div>
          </div>
          <div>
            <Label>Signature</Label>
            <Textarea rows={3} value={s.signature || ""} onChange={(e) => setS({ ...s, signature: e.target.value })} />
          </div>
          <div>
            <Label>AI Instructions (system prompt addendum)</Label>
            <Textarea rows={6} value={s.ai_instructions || ""} onChange={(e) => setS({ ...s, ai_instructions: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Zoho Account ID (optional override)</Label><Input value={s.zoho_account_id || ""} onChange={(e) => setS({ ...s, zoho_account_id: e.target.value })} /></div>
            <div><Label>Zoho Region (com / eu / in / com.au)</Label><Input value={s.zoho_region || "com"} onChange={(e) => setS({ ...s, zoho_region: e.target.value })} /></div>
          </div>
          {s.last_poll_at && <div className="text-xs text-muted-foreground">Last poll: {new Date(s.last_poll_at).toLocaleString()} — {s.last_poll_status}</div>}
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </Button>
        </GlassCard>
      </div>
    </DashboardLayout>
  );
}
