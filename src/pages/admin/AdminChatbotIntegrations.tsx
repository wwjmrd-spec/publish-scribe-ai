import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { ChatbotNav } from "@/components/admin/ChatbotNav";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2 } from "lucide-react";

const API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot-public`;
const WEBHOOK = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

export default function AdminChatbotIntegrations() {
  const { toast } = useToast();
  const [sites, setSites] = useState<any[] | null>(null);

  useEffect(() => {
    (supabase as any).from("chatbot_sites").select("*").order("created_at")
      .then(({ data }: any) => setSites(data ?? []));
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  if (!sites) {
    return (
      <DashboardLayout type="admin">
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="admin">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Chatbot Integrations</h1>
        <p className="text-muted-foreground mb-6">Embed the assistant on any website, or connect WhatsApp.</p>
        <ChatbotNav />

        {sites.map((s) => {
          const snippet = `<script src="${window.location.origin}/chatbot/sdk.js"\n        data-public-key="${s.public_key}"\n        data-api="${API}"\n        defer></script>`;
          return (
            <GlassCard key={s.id} className="p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold">{s.name}</h2>
                  <p className="text-xs text-muted-foreground">Public key: {s.public_key}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => copy(s.public_key)}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Key
                </Button>
              </div>
              <pre className="text-xs bg-[hsl(var(--glass-bg))] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-muted-foreground">
                  Allowed domains: {(s.allowed_origins ?? []).join(", ") || "any"}
                </p>
                <Button size="sm" onClick={() => copy(snippet)}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy embed code
                </Button>
              </div>
            </GlassCard>
          );
        })}

        <GlassCard className="p-5">
          <h2 className="font-semibold mb-2">WhatsApp Business</h2>
          <p className="text-sm text-muted-foreground mb-3">
            In the Meta WhatsApp app, set the callback URL below and use your verify token. Once the three
            WhatsApp credentials are saved, messages sent to your business number are answered by the assistant
            with the same Knowledge Base and escalation rules.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs flex-1 bg-[hsl(var(--glass-bg))] rounded-lg p-3 break-all">{WEBHOOK}</code>
            <Button size="sm" variant="outline" onClick={() => copy(WEBHOOK)}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </GlassCard>
      </div>
    </DashboardLayout>
  );
}
