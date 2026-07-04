import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/layout/GlassCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users } from "lucide-react";

export function MauticBackfillCard() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ total: number; synced: number; failed: number } | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("mautic-backfill", { body: {} });
      if (error) throw error;
      const r = data as { total: number; synced: number; failed: number };
      setResult(r);
      toast({
        title: "Mautic backfill complete",
        description: `${r.synced}/${r.total} contacts synced (${r.failed} failed).`,
      });
    } catch (e: any) {
      toast({ title: "Backfill failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <GlassCard className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Mautic — Backfill All Contacts
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Push every existing author's profile (name, country, affiliation) and their current
            article statuses as <code>article-status-&lt;status&gt;</code> tags to Mautic.
            Existing contacts are updated in place.
          </p>
        </div>
        <Button onClick={run} disabled={running} className="whitespace-nowrap">
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Run backfill
        </Button>
      </div>
      {result && (
        <div className="text-sm rounded-md border border-border bg-muted/20 p-3">
          Total: <strong>{result.total}</strong> · Synced: <strong className="text-emerald-400">{result.synced}</strong> · Failed: <strong className="text-rose-400">{result.failed}</strong>
        </div>
      )}
    </GlassCard>
  );
}
