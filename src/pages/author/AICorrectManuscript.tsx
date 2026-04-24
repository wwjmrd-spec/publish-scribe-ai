import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import {
  Sparkles,
  Wand2,
  Download,
  Send,
  ArrowLeft,
  Crown,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface CorrectionResult {
  filePath: string;
  downloadUrl: string | null;
  changeSummary: string[];
  previewText: string;
}

export default function AICorrectManuscript() {
  const { articleId } = useParams<{ articleId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { subscription, isLoading: subLoading } = useSubscription();

  const [running, setRunning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const pollingRef = useRef<number | null>(null);

  const { data: article, isLoading } = useQuery({
    queryKey: ['ai-correct-article', articleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', articleId!)
        .eq('author_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!articleId && !!user?.id,
  });

  const isPro = subscription.plan === 'pro' && subscription.isActive;
  const hasReview = !!article?.review_report_url;

  const stopPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const pollCorrectionStatus = async () => {
    if (!articleId) return;

    try {
      const { data, error } = await supabase.functions.invoke('ai-correct-manuscript', {
        body: { articleId, mode: 'status' },
      });

      if (error) throw new Error(error.message || 'Failed');

      if (data?.status === 'completed' && data?.filePath) {
        setResult({
          filePath: data.filePath,
          downloadUrl: data.downloadUrl,
          changeSummary: data.changeSummary || [],
          previewText: data.previewText || '',
        });
        setProcessing(false);
        stopPolling();
        toast.success('AI corrections ready — review below');
        return;
      }

      if (data?.status === 'processing') {
        setProcessing(true);
        if (!pollingRef.current) startPolling();
        return;
      }

      if (data?.status === 'failed') {
        setProcessing(false);
        stopPolling();
        toast.error(data?.error || 'AI correction failed');
      }
    } catch (err: any) {
      setProcessing(false);
      stopPolling();
      toast.error(err.message || 'AI correction failed');
    }
  };

  const startPolling = () => {
    stopPolling();
    pollingRef.current = window.setInterval(() => {
      void pollCorrectionStatus();
    }, 4000);
  };

  useEffect(() => {
    if (!articleId) return;
    void pollCorrectionStatus();
    return () => stopPolling();
  }, [articleId]);

  const runCorrection = async (force = false) => {
    if (!articleId) return;
    setRunning(true);
    setProcessing(false);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-correct-manuscript', {
        body: { articleId, mode: 'preview', force },
      });
      if (error) throw new Error(error.message || 'Failed');

      if (data?.status === 'processing') {
        setProcessing(true);
        startPolling();
        toast.info('AI correction started — this can take a little while');
        return;
      }

      if (!data?.success) throw new Error(data?.error || 'Failed to generate corrections');
      setResult({
        filePath: data.filePath,
        downloadUrl: data.downloadUrl,
        changeSummary: data.changeSummary || [],
        previewText: data.previewText || '',
      });
      toast.success('AI corrections ready — review below');
    } catch (err: any) {
      toast.error(err.message || 'AI correction failed');
    } finally {
      setRunning(false);
    }
  };

  const sendForReview = async () => {
    if (!articleId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-correct-manuscript', {
        body: { articleId, mode: 'submit' },
      });
      if (error) throw new Error(error.message || 'Failed');
      if (!data?.success) throw new Error(data?.error || 'Submission failed');
      toast.success('Corrected manuscript sent for review');
      navigate('/author/articles');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send for review');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || subLoading) {
    return (
      <DashboardLayout type="author">
        <div className="flex items-center justify-center h-64">
          <GlassSpinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!article) {
    return (
      <DashboardLayout type="author">
        <div className="text-center py-16">
          <p className="text-muted-foreground">Article not found.</p>
          <Button onClick={() => navigate('/author/articles')} className="mt-4">
            Back to My Articles
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="author">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate('/author/articles')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>

        <div className="mb-6 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">AI Auto-Correct Manuscript</h1>
            <p className="text-muted-foreground">
              Apply the review report's feedback automatically using AI.
            </p>
          </div>
        </div>

        <GlassCard className="mb-6">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-primary" /> Article
          </h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Reference:</span> <span className="font-medium">{article.reference_number}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <span className="font-medium capitalize">{(article.status || '').replace(/_/g, ' ')}</span></div>
            <div className="sm:col-span-2"><span className="text-muted-foreground">Title:</span> <span className="font-medium">{article.title}</span></div>
          </div>
        </GlassCard>

        {/* Pro gate */}
        {!isPro && (
          <GlassCard className="mb-6 border-2 border-primary/40">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Crown className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Pro feature</h3>
                <p className="text-sm text-muted-foreground">
                  AI Auto-Correct is available for Pro subscribers. Upgrade to let AI rewrite your manuscript according to the review report.
                </p>
              </div>
              <Button onClick={() => navigate('/author/subscription')} className="gradient-primary">
                <Crown className="w-4 h-4 mr-1" /> Upgrade to Pro
              </Button>
            </div>
          </GlassCard>
        )}

        {/* Review-required gate */}
        {isPro && !hasReview && (
          <GlassCard className="mb-6">
            <div className="flex gap-3 items-start">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">Review report not ready</h3>
                <p className="text-sm text-muted-foreground">
                  AI corrections need the review report first. You'll see this option once your AI review is generated.
                </p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Main action */}
        {isPro && hasReview && !result && (
          <GlassCard className="mb-6">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" /> Generate corrected manuscript
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              AI will read your manuscript and the review report, then produce a fully corrected version.
              Factual content (data, citations, results) is preserved — only writing quality, structure, and clarity are improved.
            </p>
               <Button onClick={() => runCorrection()} disabled={running || processing} className="gradient-primary">
               {running || processing ? (
                <><GlassSpinner size="sm" /> <span className="ml-2">AI is correcting…</span></>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Make corrections as per review report</>
              )}
            </Button>
          </GlassCard>
        )}

        {isPro && hasReview && processing && !result && (
          <GlassCard className="mb-6">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" /> AI correction in progress
            </h3>
            <p className="text-sm text-muted-foreground">
              Your manuscript is being rewritten in the background. This page will update automatically when the corrected version is ready.
            </p>
          </GlassCard>
        )}

        {/* Result */}
        {result && (
          <>
            <GlassCard className="mb-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" /> Corrections applied
              </h3>
              {result.changeSummary.length > 0 && (
                <ul className="space-y-2 text-sm mb-4">
                  {result.changeSummary.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span className="text-muted-foreground">{c}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {result.downloadUrl && (
                  <a href={result.downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-1" /> Download corrected .docx
                    </Button>
                  </a>
                )}
                <Button variant="ghost" size="sm" onClick={() => runCorrection(true)} disabled={running || processing}>
                  <Wand2 className="w-4 h-4 mr-1" /> Regenerate
                </Button>
              </div>
            </GlassCard>

            <GlassCard className="mb-6">
              <h3 className="font-semibold mb-3">Preview (first ~4000 chars)</h3>
              <div className="max-h-[400px] overflow-y-auto rounded-lg bg-[hsl(var(--glass-bg-strong))] p-4 text-sm whitespace-pre-wrap font-mono">
                {result.previewText}
              </div>
            </GlassCard>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => navigate('/author/articles')} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={sendForReview} disabled={submitting} className="gradient-primary min-w-[200px]">
                {submitting ? (
                  <GlassSpinner size="sm" />
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Send for review</>
                )}
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
