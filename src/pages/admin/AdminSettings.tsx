import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Brain, Mail, SendHorizonal, AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

const AI_PROVIDERS = [
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
];

const EMAIL_PROVIDERS = [
  { id: "resend", label: "Resend", help: "Uses RESEND_API_KEY secret. Recommended default." },
  { id: "aws-ses", label: "AWS SES", help: "Configure access keys + region below." },
  { id: "sendgrid", label: "SendGrid", help: "Uses SENDGRID_API_KEY secret." },
  { id: "mailgun", label: "Mailgun", help: "Uses MAILGUN_API_KEY secret + domain." },
];

type AiBackup = { provider: string; api_key: string; model: string };
type EmailBackup = { provider: string; from: string; mailgun_domain?: string };

export default function AdminSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  // AI primary
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [aiBackups, setAiBackups] = useState<AiBackup[]>([]);
  const [savingAi, setSavingAi] = useState(false);

  // Thresholds
  const [acceptThreshold, setAcceptThreshold] = useState("70");
  const [revisionThreshold, setRevisionThreshold] = useState("40");
  const [savingThresholds, setSavingThresholds] = useState(false);

  // Email primary
  const [emailProvider, setEmailProvider] = useState("resend");
  const [emailFrom, setEmailFrom] = useState("WWJMRD <noreply@wwjmrdai.online>");
  const [mailgunDomain, setMailgunDomain] = useState("");
  const [emailBackups, setEmailBackups] = useState<EmailBackup[]>([]);
  const [savingEmail, setSavingEmail] = useState(false);

  // AWS SES
  const [awsKey, setAwsKey] = useState("");
  const [awsSecret, setAwsSecret] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [savingSes, setSavingSes] = useState(false);

  // Test
  const [testTo, setTestTo] = useState("");
  const [testProvider, setTestProvider] = useState("default");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("admin_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "ai_provider", "ai_api_key", "ai_model", "ai_backup_chain",
          "auto_accept_threshold", "auto_revision_threshold",
          "email_provider", "email_from_address", "mailgun_domain", "email_backup_chain",
          "aws_access_key_id", "aws_secret_access_key", "aws_ses_region",
        ]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => (map[r.setting_key] = r.setting_value ?? ""));
      if (map.ai_api_key) setApiKey(map.ai_api_key);
      if (map.ai_model) setModel(map.ai_model);
      if (map.ai_backup_chain) {
        try { setAiBackups(JSON.parse(map.ai_backup_chain)); } catch (_) {}
      }
      if (map.auto_accept_threshold) setAcceptThreshold(map.auto_accept_threshold);
      if (map.auto_revision_threshold) setRevisionThreshold(map.auto_revision_threshold);
      if (map.email_provider) setEmailProvider(map.email_provider);
      if (map.email_from_address) setEmailFrom(map.email_from_address);
      if (map.mailgun_domain) setMailgunDomain(map.mailgun_domain);
      if (map.email_backup_chain) {
        try { setEmailBackups(JSON.parse(map.email_backup_chain)); } catch (_) {}
      }
      if (map.aws_access_key_id) setAwsKey(map.aws_access_key_id);
      if (map.aws_secret_access_key) setAwsSecret(map.aws_secret_access_key);
      if (map.aws_ses_region) setAwsRegion(map.aws_ses_region);
      setLoading(false);
    })();
  }, []);

  const saveSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase
      .from("admin_settings").select("id").eq("setting_key", key).maybeSingle();
    if (existing) {
      await supabase.from("admin_settings")
        .update({ setting_value: value, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("admin_settings").insert({ setting_key: key, setting_value: value });
    }
  };

  const saveAi = async () => {
    setSavingAi(true);
    try {
      await saveSetting("ai_provider", "gemini");
      await saveSetting("ai_api_key", apiKey.trim());
      await saveSetting("ai_model", model.trim());
      const cleaned = aiBackups.filter((b) => b.provider && b.api_key.trim());
      await saveSetting("ai_backup_chain", JSON.stringify(cleaned));
      toast({ title: "AI settings saved", description: `Primary + ${cleaned.length} backup${cleaned.length === 1 ? "" : "s"}.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingAi(false);
    }
  };

  const saveThresholds = async () => {
    const accept = Number(acceptThreshold);
    const revision = Number(revisionThreshold);
    if (isNaN(accept) || isNaN(revision) || accept < 0 || accept > 100 || revision < 0 || revision > 100) {
      toast({ title: "Invalid values", description: "Thresholds must be between 0 and 100.", variant: "destructive" });
      return;
    }
    if (revision >= accept) {
      toast({ title: "Invalid range", description: "Revision threshold must be lower than acceptance threshold.", variant: "destructive" });
      return;
    }
    setSavingThresholds(true);
    try {
      await saveSetting("auto_accept_threshold", String(accept));
      await saveSetting("auto_revision_threshold", String(revision));
      toast({ title: "Thresholds saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingThresholds(false);
    }
  };

  const saveEmail = async () => {
    setSavingEmail(true);
    try {
      await saveSetting("email_provider", emailProvider);
      await saveSetting("email_from_address", emailFrom.trim());
      await saveSetting("mailgun_domain", mailgunDomain.trim());
      const cleaned = emailBackups.filter((b) => b.provider);
      await saveSetting("email_backup_chain", JSON.stringify(cleaned));
      toast({ title: "Email settings saved", description: `Primary: ${emailProvider} + ${cleaned.length} backup${cleaned.length === 1 ? "" : "s"}.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingEmail(false);
    }
  };

  const saveSes = async () => {
    setSavingSes(true);
    try {
      await saveSetting("aws_access_key_id", awsKey.trim());
      await saveSetting("aws_secret_access_key", awsSecret.trim());
      await saveSetting("aws_ses_region", awsRegion.trim() || "us-east-1");
      toast({ title: "AWS SES credentials saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingSes(false);
    }
  };

  const runTest = async () => {
    if (!testTo.includes("@")) {
      toast({ title: "Enter a valid recipient email", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const override = testProvider === "default" ? undefined : testProvider;
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: testTo.trim(),
          template: "custom",
          subject: `Test email from ${override || "primary+fallback chain"}`,
          html: `<h2>Email server test</h2><p>This is a test email sent through <strong>${override || "primary + backup fallback chain"}</strong> by your WWJMRD admin panel.</p><p>Sent at: ${new Date().toISOString()}</p>`,
          providerOverride: override,
          fromOverride: emailFrom.trim(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setTestResult({ ok: true, message: `Email sent via ${override || "active provider chain"} to ${testTo}.` });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const addAiBackup = () => setAiBackups((prev) => [...prev, { provider: "gemini", api_key: "", model: "gemini-2.5-flash" }]);
  const updateAiBackup = (i: number, patch: Partial<AiBackup>) =>
    setAiBackups((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const removeAiBackup = (i: number) => setAiBackups((prev) => prev.filter((_, idx) => idx !== i));

  const addEmailBackup = () => setEmailBackups((prev) => [...prev, { provider: "aws-ses", from: emailFrom }]);
  const updateEmailBackup = (i: number, patch: Partial<EmailBackup>) =>
    setEmailBackups((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const removeEmailBackup = (i: number) => setEmailBackups((prev) => prev.filter((_, idx) => idx !== i));

  if (loading) {
    return (
      <DashboardLayout type="admin">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="admin">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure AI providers (with backup fallback), email sending servers (with backup fallback), and AWS SES credentials.
          </p>
        </div>

        <Tabs defaultValue="ai" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="ai"><Brain className="w-4 h-4 mr-2" /> AI</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="email"><Mail className="w-4 h-4 mr-2" /> Email</TabsTrigger>
            <TabsTrigger value="ses">AWS SES</TabsTrigger>
          </TabsList>

          {/* ============== AI TAB ============== */}
          <TabsContent value="ai" className="space-y-6">
            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold">Primary AI (Gemini)</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Used for review, formatting, subject generation, manuscript correction and AI writers.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Gemini API Key</Label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your Gemini API key" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>Gemini Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GEMINI_MODELS.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </GlassCard>

            <GlassCard className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Backup AI providers</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    If the primary AI returns rate-limit (429), quota-exhausted (402) or server (5xx) errors, the system
                    automatically tries each backup in order. Add 2–3 backups so AI work never stops.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addAiBackup}>
                  <Plus className="w-4 h-4 mr-1" /> Add backup
                </Button>
              </div>

              {aiBackups.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No backup AIs configured.</p>
              )}

              {aiBackups.map((b, i) => (
                <div key={i} className="rounded-md border border-border p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Backup #{i + 1}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeAiBackup(i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Provider</Label>
                      <Select value={b.provider} onValueChange={(v) => updateAiBackup(i, { provider: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AI_PROVIDERS.map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">API Key</Label>
                      <Input type="password" value={b.api_key} onChange={(e) => updateAiBackup(i, { api_key: e.target.value })} placeholder="Backup API key" />
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs">Model</Label>
                      <Input value={b.model} onChange={(e) => updateAiBackup(i, { model: e.target.value })} placeholder="Model name (e.g. gpt-4o-mini)" />
                    </div>
                  </div>
                </div>
              ))}
            </GlassCard>

            <div className="flex justify-end">
              <Button onClick={saveAi} disabled={savingAi}>
                {savingAi && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save AI Settings
              </Button>
            </div>
          </TabsContent>

          {/* ============== AUTOMATION TAB ============== */}
          <TabsContent value="automation" className="space-y-6">
            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold">Automation Score Thresholds</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Scores ≥ acceptance auto-accept. Between revision and acceptance request a revision. Below the revision threshold is rejected.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Acceptance threshold (%)</Label>
                  <Input type="number" min={0} max={100} value={acceptThreshold} onChange={(e) => setAcceptThreshold(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Revision threshold (%)</Label>
                  <Input type="number" min={0} max={100} value={revisionThreshold} onChange={(e) => setRevisionThreshold(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveThresholds} disabled={savingThresholds}>
                  {savingThresholds && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Thresholds
                </Button>
              </div>
            </GlassCard>
          </TabsContent>

          {/* ============== EMAIL TAB ============== */}
          <TabsContent value="email" className="space-y-6">
            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold">Primary Email Server</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  The primary provider for all transactional and notification emails.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={emailProvider} onValueChange={setEmailProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMAIL_PROVIDERS.map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {EMAIL_PROVIDERS.find((p) => p.id === emailProvider)?.help}
                </p>
              </div>
              <div className="space-y-2">
                <Label>From address</Label>
                <Input value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} placeholder="WWJMRD <noreply@wwjmrdai.online>" />
              </div>
              {emailProvider === "mailgun" && (
                <div className="space-y-2">
                  <Label>Mailgun domain</Label>
                  <Input value={mailgunDomain} onChange={(e) => setMailgunDomain(e.target.value)} placeholder="mg.yourdomain.com" />
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Backup email servers</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    If the primary provider fails (quota or outage), the system automatically retries with each backup in order.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addEmailBackup}>
                  <Plus className="w-4 h-4 mr-1" /> Add backup
                </Button>
              </div>

              {emailBackups.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No backup email servers configured.</p>
              )}

              {emailBackups.map((b, i) => (
                <div key={i} className="rounded-md border border-border p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Backup #{i + 1}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeEmailBackup(i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Provider</Label>
                      <Select value={b.provider} onValueChange={(v) => updateEmailBackup(i, { provider: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EMAIL_PROVIDERS.map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">From address (optional)</Label>
                      <Input value={b.from} onChange={(e) => updateEmailBackup(i, { from: e.target.value })} placeholder="Leave empty to use primary" />
                    </div>
                    {b.provider === "mailgun" && (
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Mailgun domain</Label>
                        <Input value={b.mailgun_domain || ""} onChange={(e) => updateEmailBackup(i, { mailgun_domain: e.target.value })} placeholder="mg.yourdomain.com" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </GlassCard>

            <div className="flex justify-end">
              <Button onClick={saveEmail} disabled={savingEmail}>
                {savingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Email Settings
              </Button>
            </div>

            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold flex items-center gap-2"><SendHorizonal className="w-4 h-4" /> Test email server</h2>
                <p className="text-sm text-muted-foreground mt-1">Sends a sample email through the chosen provider.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Send to</Label>
                  <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Via</Label>
                  <Select value={testProvider} onValueChange={setTestProvider}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (primary + backups)</SelectItem>
                      {EMAIL_PROVIDERS.map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={runTest} disabled={testing}>
                  {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Send Test Email
                </Button>
              </div>
              {testResult && (
                <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${testResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                  {testResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </GlassCard>
          </TabsContent>

          {/* ============== AWS SES TAB ============== */}
          <TabsContent value="ses" className="space-y-6">
            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold">AWS SES Credentials</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Provide the AWS access keys used when sending email through AWS SES (either as primary or as a backup).
                  These are stored securely in admin settings and used by the email sender.
                </p>
              </div>
              <div className="space-y-2">
                <Label>AWS Access Key ID</Label>
                <Input value={awsKey} onChange={(e) => setAwsKey(e.target.value)} placeholder="AKIA..." autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>AWS Secret Access Key</Label>
                <Input type="password" value={awsSecret} onChange={(e) => setAwsSecret(e.target.value)} placeholder="Paste your AWS secret access key" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>SES Region</Label>
                <Input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} placeholder="us-east-1" />
                <p className="text-xs text-muted-foreground">Examples: us-east-1, eu-west-1, ap-south-1. The From address must be a verified SES identity in this region.</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveSes} disabled={savingSes}>
                  {savingSes && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save AWS SES Credentials
                </Button>
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
