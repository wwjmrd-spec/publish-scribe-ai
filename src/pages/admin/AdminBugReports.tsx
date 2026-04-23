import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Bug, Bot, CheckCircle, Loader2, Sparkles, Copy, Wrench } from 'lucide-react';
import { format } from 'date-fns';

interface BugReport {
  id: string;
  user_id: string;
  type: string;
  title: string;
  description: string | null;
  page_url: string | null;
  user_agent: string | null;
  error_stack: string | null;
  status: string;
  ai_response: string | null;
  resolved_at: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

export default function AdminBugReports() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiContextId, setAiContextId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFix, setAiFix] = useState<string | null>(null);

  const runAiFix = async () => {
    if (!aiPrompt.trim()) {
      toast({ title: 'Prompt required', description: 'Describe the error or paste the message.', variant: 'destructive' });
      return;
    }
    setAiBusy(true);
    setAiFix(null);
    try {
      const ctxReport = aiContextId ? reports.find((r) => r.id === aiContextId) : null;
      const context = ctxReport
        ? `Title: ${ctxReport.title}\nDescription: ${ctxReport.description || ''}\nPage: ${ctxReport.page_url || ''}\nError: ${ctxReport.error_stack || ''}`
        : undefined;
      const { data, error } = await supabase.functions.invoke('ai-fix-assistant', {
        body: { prompt: aiPrompt, context },
      });
      if (error) throw error;
      setAiFix(data?.fix || 'No response.');
    } catch (err: any) {
      toast({ title: 'AI error', description: err.message || 'Failed to generate fix', variant: 'destructive' });
    } finally {
      setAiBusy(false);
    }
  };

  const copyFix = () => {
    if (!aiFix) return;
    navigator.clipboard.writeText(aiFix);
    toast({ title: 'Copied to clipboard' });
  };

  const applyFix = async () => {
    if (!aiFix) return;
    const ctxReport = aiContextId ? reports.find((r) => r.id === aiContextId) : null;
    const lovablePrompt = [
      'Apply the following fix to the project. Implement all code changes needed and verify the result.',
      '',
      ctxReport ? `Bug report: ${ctxReport.title}` : '',
      ctxReport?.page_url ? `Page: ${ctxReport.page_url}` : '',
      ctxReport?.error_stack ? `Error:\n${ctxReport.error_stack}` : '',
      '',
      'Fix plan:',
      aiFix,
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(lovablePrompt);
    } catch {}

    if (aiContextId) {
      await (supabase as any)
        .from('bug_reports')
        .update({ ai_response: aiFix, status: 'ai_responded' })
        .eq('id', aiContextId);
      fetchReports();
    }

    const lovableUrl = `https://lovable.dev/projects/7fb6d7a3-9d67-46c8-b220-2239f19803b5`;
    window.open(lovableUrl, '_blank', 'noopener,noreferrer');

    toast({
      title: 'Fix ready to apply',
      description: 'Plan copied to clipboard. Paste it into the Lovable chat that just opened to apply the code changes.',
    });
  };

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('bug_reports')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: false });

    if (!error && data) setReports(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleAIFix = async (report: BugReport) => {
    setFixingId(report.id);
    try {
      const { data, error } = await supabase.functions.invoke('ai-bug-fix', {
        body: { reportId: report.id },
      });
      if (error) throw error;
      toast({ title: 'AI response sent', description: 'The author has been notified with a troubleshooting guide.' });
      fetchReports();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to process AI fix', variant: 'destructive' });
    } finally {
      setFixingId(null);
    }
  };

  const handleMarkResolved = async (id: string) => {
    await (supabase as any)
      .from('bug_reports')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id);
    fetchReports();
  };

  const statusColor = (s: string) => {
    if (s === 'resolved') return 'default';
    if (s === 'ai_responded') return 'secondary';
    return 'destructive';
  };

  return (
    <DashboardLayout type="admin">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Bug className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-display font-bold gradient-text">Bug Reports</h1>
        </div>

        {/* AI Fix Assistant */}
        <Card className="glass-card border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> AI Fix Assistant
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Describe an error or paste a message — AI will return a step-by-step fix plan.
              {aiContextId && ' (Linked to selected bug report)'}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder='e.g. "Pro plan users get Failed to download review report when clicking the download button."'
              className="min-h-[80px]"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={runAiFix} disabled={aiBusy || !aiPrompt.trim()} size="sm">
                {aiBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Generate fix
              </Button>
              {aiContextId && (
                <Button variant="outline" size="sm" onClick={() => setAiContextId(null)}>
                  Clear linked report
                </Button>
              )}
              {aiFix && (
                <Button variant="outline" size="sm" onClick={copyFix}>
                  <Copy className="w-4 h-4 mr-1" /> Copy fix
                </Button>
              )}
              {aiFix && (
                <Button size="sm" onClick={applyFix} className="bg-gradient-to-r from-primary to-accent">
                  <Wrench className="w-4 h-4 mr-1" /> Apply fix
                </Button>
              )}
            </div>
            {aiFix && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Fix plan
                </p>
                <p className="text-sm whitespace-pre-wrap">{aiFix}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No bug reports yet — everything is running smoothly! 🎉
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((r) => (
              <Card key={r.id} className="glass-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold truncate">{r.title}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {r.profiles?.full_name || 'Unknown'} ({r.profiles?.email}) •{' '}
                        {format(new Date(r.created_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{r.type}</Badge>
                      <Badge variant={statusColor(r.status)}>{r.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {r.description && (
                    <p className="text-sm text-muted-foreground">{r.description}</p>
                  )}
                  {r.page_url && (
                    <p className="text-xs text-muted-foreground font-mono truncate">Page: {r.page_url}</p>
                  )}
                  {r.error_stack && (
                    <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-32 font-mono">
                      {r.error_stack}
                    </pre>
                  )}
                  {r.ai_response && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-primary flex items-center gap-1">
                        <Bot className="w-3 h-3" /> AI Response (sent to author)
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{r.ai_response}</p>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    {r.status === 'open' && (
                      <Button
                        size="sm"
                        onClick={() => handleAIFix(r)}
                        disabled={fixingId === r.id}
                      >
                        {fixingId === r.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Bot className="w-4 h-4 mr-1" />
                        )}
                        AI Fix & Reply
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAiContextId(r.id);
                        setAiPrompt(`Fix: ${r.title}`);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-1" /> Ask AI to fix
                    </Button>
                    {r.status !== 'resolved' && (
                      <Button size="sm" variant="outline" onClick={() => handleMarkResolved(r.id)}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Mark Resolved
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
