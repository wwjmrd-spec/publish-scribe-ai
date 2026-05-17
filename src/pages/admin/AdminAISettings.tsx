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
import { Loader2 } from "lucide-react";

const PROVIDER_DEFAULTS: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
};

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

const PROVIDER_HINTS: Record<string, string> = {
  gemini: "Get a key at https://aistudio.google.com/apikey. Recommended: gemini-2.5-flash. If one model is limited, switch models here.",
  openai: "Get a key at https://platform.openai.com/api-keys. Examples: gpt-4o-mini, gpt-4o, gpt-4-turbo.",
  groq: "Get a key at https://console.groq.com/keys. Examples: llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768.",
};

export default function AdminAISettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("admin_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["ai_provider", "ai_api_key", "ai_model"]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => (map[r.setting_key] = r.setting_value ?? ""));
      if (map.ai_provider) setProvider(map.ai_provider);
      if (map.ai_api_key) setApiKey(map.ai_api_key);
      if (map.ai_model) setModel(map.ai_model);
      setLoading(false);
    })();
  }, []);

  const handleProviderChange = (val: string) => {
    setProvider(val);
    if (!model || Object.values(PROVIDER_DEFAULTS).includes(model)) {
      setModel(PROVIDER_DEFAULTS[val] || "");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const rows = [
        { setting_key: "ai_provider", setting_value: provider },
        { setting_key: "ai_api_key", setting_value: apiKey.trim() },
        { setting_key: "ai_model", setting_value: model.trim() },
      ];
      for (const row of rows) {
        const { data: existing } = await supabase
          .from("admin_settings")
          .select("id")
          .eq("setting_key", row.setting_key)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("admin_settings")
            .update({ setting_value: row.setting_value, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("admin_settings").insert(row);
        }
      }
      toast({ title: "AI settings saved", description: "All AI features will now use this configuration." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
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
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">AI Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure the AI provider used across all AI features (Article Review, Formatting, Subject Generation, Bug Fix Assistant, Manuscript Correction).
          </p>
        </div>

        <GlassCard className="p-6 space-y-5">
          <div className="space-y-2">
            <Label>AI Provider</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
                <SelectItem value="groq">Groq</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{PROVIDER_HINTS[provider]}</p>
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key here"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to fall back to the server environment variable for this provider.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={PROVIDER_DEFAULTS[provider]} />
          </div>

          <div className="flex justify-end gap-3">
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="font-semibold mb-2">How it works</h2>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>All AI features read this configuration on every request.</li>
            <li>Each provider uses its OpenAI-compatible chat completions endpoint.</li>
            <li>Switch providers anytime — no redeploy required.</li>
            <li>Keys are stored in the database with admin-only access.</li>
          </ul>
        </GlassCard>
      </div>
    </DashboardLayout>
  );
}
