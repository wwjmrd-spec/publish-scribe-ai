import React, { useState } from 'react';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Brain, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Download, Send, Pencil, Save, X, Clock, FileText,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';

interface Props { articleId: string }

export function AIReviewSection({ articleId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['admin-article-reviews', articleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('article_reviews')
        .select('*')
        .eq('article_id', articleId)
        .order('reviewed_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-article-reviews', articleId] });
    qc.invalidateQueries({ queryKey: ['admin-article-detail', articleId] });
    qc.invalidateQueries({ queryKey: ['admin-articles-for-review'] });
  };

  const latest: any = reviews?.[0];

  const reviewMut = useMutation({
    mutationFn: async () => {
      const r = await supabase.functions.invoke('ai-review', { body: { articleId } });
      if (r.error) throw new Error(r.error.message);
      if (r.data?.error) throw new Error(r.data.message || r.data.error);
      return r.data;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('AI review completed. Approve to send to author.');
    },
    onError: (e: any) => toast.error('Review failed: ' + e.message),
  });

  const approveMut = useMutation({
    mutationFn: async (reviewId: string) => {
      const r = await supabase.functions.invoke('approve-review', { body: { reviewId, action: 'approve' } });
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Review approved and sent to the author.');
    },
    onError: (e: any) => toast.error('Approval failed: ' + e.message),
  });

  const saveScoresMut = useMutation({
    mutationFn: async (payload: { reviewId: string; scores: any }) => {
      const r = await supabase.functions.invoke('approve-review', {
        body: { reviewId: payload.reviewId, action: 'update_scores', scores: payload.scores },
      });
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Scores updated. Approve to send the new report.');
      setEditing(false); setDraft(null);
    },
    onError: (e: any) => toast.error('Failed to update scores: ' + e.message),
  });

  const downloadReport = async (fileType: 'review_report' | 'pending_review_report') => {
    const tid = toast.loading('Preparing review report…');
    try {
      const r = await supabase.functions.invoke('get-document-url', { body: { articleId, fileType } });
      if (r.error || !r.data?.url) { toast.error('Failed to get download link', { id: tid }); return; }
      toast.success('Report ready', { id: tid });
      const a = document.createElement('a');
      a.href = r.data.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.download = `review-report-${articleId}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch { toast.error('Failed to download report', { id: tid }); }
  };

  const scoreColor = (s: number) => s >= 80 ? 'text-green-400' : 'text-yellow-400';
  const scoreBg = (s: number) => s >= 80 ? 'bg-green-500/20 border-green-500/30' : 'bg-yellow-500/20 border-yellow-500/30';

  const recBadge = (rec: string) => {
    switch (rec) {
      case 'accept': return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' };
      case 'minor_revisions': return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
      case 'major_revisions': return { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/20' };
      case 'reject': return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' };
      default: return { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted' };
    }
  };

  const startEdit = () => {
    setDraft({
      plagiarism_score: latest?.plagiarism_score ?? 0,
      grammar_score: latest?.grammar_score ?? 0,
      content_score: latest?.content_score ?? 0,
      overall_score: latest?.overall_score ?? 0,
    });
    setEditing(true);
  };

  const feedback = latest?.detailed_feedback as any;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" /> AI Review
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}>
            {reviewMut.isPending ? <><GlassSpinner size="sm" className="mr-2" />Analyzing...</>
              : latest ? <><RefreshCw className="w-4 h-4 mr-2" />Re-analyze</>
              : <><Brain className="w-4 h-4 mr-2" />Analyze</>}
          </Button>
          {latest?.report_url && !latest?.approved && (
            <DownloadButton size="sm" onDownload={() => downloadReport('pending_review_report')}>
              Preview Report
            </DownloadButton>
          )}
          {latest?.report_url && !latest?.approved && (
            <Button variant="default" size="sm" onClick={() => approveMut.mutate(latest.id)} disabled={approveMut.isPending}>
              {approveMut.isPending ? <><GlassSpinner size="sm" className="mr-2" />Sending...</>
                : <><Send className="w-4 h-4 mr-2" />Approve & Send</>}
            </Button>
          )}
          {latest?.approved && (
            <DownloadButton size="sm" onDownload={() => downloadReport('review_report')}>
              Report
            </DownloadButton>
          )}
        </div>
      </div>

      {isLoading && <div className="py-6 flex justify-center"><GlassSpinner /></div>}

      {!isLoading && !latest && (
        <p className="text-sm text-muted-foreground py-4">No AI review yet. Click Analyze to generate one.</p>
      )}

      {latest && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {latest.approved ? (
              <Badge className="bg-green-500/20 text-green-400 border border-green-500/40 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />Sent to author
              </Badge>
            ) : (
              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 flex items-center gap-1">
                <Clock className="w-3 h-3" />Pending approval
              </Badge>
            )}
            {latest.scores_edited && (
              <Badge variant="secondary" className="text-xs"><Pencil className="w-3 h-3 mr-1" />Scores edited</Badge>
            )}
            {feedback?.recommendation && (() => {
              const r = recBadge(feedback.recommendation); const Icon = r.icon;
              return (
                <div className={`px-3 py-1 rounded-lg ${r.bg} flex items-center gap-2`}>
                  <Icon className={`w-4 h-4 ${r.color}`} />
                  <span className={`text-sm font-medium ${r.color} capitalize`}>{feedback.recommendation.replace('_', ' ')}</span>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Review Scores</h4>
            {editing ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveScoresMut.mutate({ reviewId: latest.id, scores: draft })} disabled={saveScoresMut.isPending}>
                  {saveScoresMut.isPending ? <><GlassSpinner size="sm" className="mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(null); }}>
                  <X className="w-4 h-4 mr-2" />Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil className="w-4 h-4 mr-2" />Edit Scores
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {([
              { key: 'plagiarism_score', label: 'Plagiarism' },
              { key: 'grammar_score', label: 'Grammar' },
              { key: 'content_score', label: 'Content' },
              { key: 'overall_score', label: 'Overall' },
            ] as const).map(({ key, label }) => {
              const val = editing ? draft?.[key] : latest[key];
              return (
                <div key={key} className={`p-3 rounded-lg border ${scoreBg(val || 0)}`}>
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  {editing ? (
                     <Input type="number" min={70} max={100} value={draft?.[key] ?? 70}
                      onChange={(e) => {
                         const v = Math.max(70, Math.min(100, Number(e.target.value) || 70));
                        setDraft({ ...draft, [key]: v });
                      }}
                      className={`text-xl font-bold h-auto py-1 ${scoreColor(val || 0)} bg-transparent`} />
                  ) : (
                    <p className={`text-xl font-bold ${scoreColor(val || 0)}`}>{val ?? 0}%</p>
                  )}
                </div>
              );
            })}
          </div>

          {latest.summary && (
            <div className="mb-3">
              <h4 className="text-sm font-medium mb-1">Summary</h4>
              <p className="text-sm text-muted-foreground p-3 rounded-lg bg-[hsl(var(--glass-bg))]">{latest.summary}</p>
            </div>
          )}

          {feedback && (
            <div className="space-y-3">
              {feedback.plagiarism && (
                <div className="p-3 rounded-lg bg-[hsl(var(--glass-bg))]">
                  <h5 className="text-sm font-medium mb-1">Plagiarism</h5>
                  <p className="text-xs text-muted-foreground">{feedback.plagiarism.assessment}</p>
                </div>
              )}
              {feedback.grammar && (
                <div className="p-3 rounded-lg bg-[hsl(var(--glass-bg))]">
                  <h5 className="text-sm font-medium mb-1">Grammar & Structure</h5>
                  <p className="text-xs text-muted-foreground">{feedback.grammar.assessment}</p>
                </div>
              )}
              {feedback.content && (
                <div className="p-3 rounded-lg bg-[hsl(var(--glass-bg))]">
                  <h5 className="text-sm font-medium mb-1">Content Quality</h5>
                  <p className="text-xs text-muted-foreground">{feedback.content.assessment}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
