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
import { Loader2, Brain, Mail, SendHorizonal, AlertTriangle, CheckCircle2 } from "lucide-react";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

const EMAIL_PROVIDERS = [
  { id: "resend", label: "Resend", help: "Uses RESEND_API_KEY secret. Recommended default." },
  { id: "aws-ses", label: "AWS SES", help: "Uses AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SES_REGION." },
  { id: "sendgrid", label: "SendGrid", help: "Uses SENDGRID_API_KEY secret." },
  { id: "mailgun", label: "Mailgun", help: "Uses MAILGUN_API_KEY and MAILGUN_DOMAIN secrets." },
];

export default function AdminSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  // AI
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [savingAi, setSavingAi] = useState(false);

  // Thresholds
  const [acceptThreshold, setAcceptThreshold] = useState("70");
  const [revisionThreshold, setRevisionThreshold] = useState("40");
  const [savingThresholds, setSavingThresholds] = useState(false);

  // Email
  const [emailProvider, setEmailProvider] = useState("resend");
  const [emailFrom, setEmailFrom] = useState("WWJMRD <noreply@wwjmrdai.online>");
  const [mailgunDomain, setMailgunDomain] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("admin_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "ai_provider", "ai_api_key", "ai_model",
          "auto_accept_threshold", "auto_revision_threshold",
          "email_provider", "email_from_address", "mailgun_domain",
        ]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => (map[r.setting_key] = r.setting_value ?? ""));
      if (map.ai_api_key) setApiKey(map.ai_api_key);
      if (map.ai_model) setModel(map.ai_model);
      if (map.auto_accept_threshold) setAcceptThreshold(map.auto_accept_threshold);
      if (map.auto_revision_threshold) setRevisionThreshold(map.auto_revision_threshold);
      if (map.email_provider) setEmailProvider(map.email_provider);
      if (map.email_from_address) setEmailFrom(map.email_from_address);
      if (map.mailgun_domain) setMailgunDomain(map.mailgun_domain);
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
      toast({ title: "AI settings saved" });
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
      if (emailProvider === "mailgun") await saveSetting("mailgun_domain", mailgunDomain.trim());
      toast({ title: "Email settings saved", description: "All emails will now go through " + emailProvider });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingEmail(false);
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
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: testTo.trim(),
          template: "custom",
          subject: `Test email from ${emailProvider}`,
          html: `<h2>Email server test</h2><p>This is a test email sent through <strong>${emailProvider}</strong> by your WWJMRD admin panel.</p><p>Sent at: ${new Date().toISOString()}</p>`,
          providerOverride: emailProvider,
          fromOverride: emailFrom.trim(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setTestResult({ ok: true, message: `Email queued via ${emailProvider} to ${testTo}.` });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

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
          <p className="text-muted-foreground mt-2">Configure AI, automation thresholds, and the email sending server.</p>
        </div>

        <Tabs defaultValue="ai" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ai"><Brain className="w-4 h-4 mr-2" /> AI</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="email"><Mail className="w-4 h-4 mr-2" /> Email Server</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-6">
            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold">Gemini AI Settings</h2>
                <p className="text-sm text-muted-foreground mt-1">Used for review, formatting, subject generation, and AI assistants.</p>
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

              <div className="flex justify-end">
                <Button onClick={saveAi} disabled={savingAi}>
                  {savingAi && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save AI Settings
                </Button>
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold">Automation Score Thresholds</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Scores ≥ acceptance auto-accept. Scores between revision and acceptance request revision. Anything below revision is rejected.
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

              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Current rule: <span className="text-foreground font-medium">≥ {acceptThreshold || 0}%</span> accept ·{" "}
                <span className="text-foreground font-medium">{revisionThreshold || 0}%–{(Number(acceptThreshold) || 0) - 1}%</span> revise ·{" "}
                <span className="text-foreground font-medium">&lt; {revisionThreshold || 0}%</span> reject
              </div>

              <div className="flex justify-end">
                <Button onClick={saveThresholds} disabled={savingThresholds}>
                  {savingThresholds && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Thresholds
                </Button>
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="email" className="space-y-6">
            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold">Email Sending Server</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose which provider sends all transactional and notification emails. Make sure the relevant API key secret is configured.
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
                <p className="text-xs text-muted-foreground">Must be a verified sender on your chosen provider.</p>
              </div>

              {emailProvider === "mailgun" && (
                <div className="space-y-2">
                  <Label>Mailgun domain</Label>
                  <Input value={mailgunDomain} onChange={(e) => setMailgunDomain(e.target.value)} placeholder="mg.yourdomain.com" />
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={saveEmail} disabled={savingEmail}>
                  {savingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Email Settings
                </Button>
              </div>
            </GlassCard>

            <GlassCard className="p-6 space-y-5">
              <div>
                <h2 className="font-semibold flex items-center gap-2"><SendHorizonal className="w-4 h-4" /> Test the email server</h2>
                <p className="text-sm text-muted-foreground mt-1">Sends a sample email using the currently-selected provider.</p>
              </div>

              <div className="space-y-2">
                <Label>Send test email to</Label>
                <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
              </div>

              <div className="flex justify-end">
                <Button onClick={runTest} disabled={testing} variant="default">
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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
