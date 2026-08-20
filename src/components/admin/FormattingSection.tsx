import React, { useState } from 'react';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { Badge } from '@/components/ui/badge';
import {
  Wand2, RefreshCw, Edit, CheckCircle, XCircle, Clock, AlertTriangle, Info,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import { ArticleContentEditor } from '@/components/admin/ArticleContentEditor';
import { downloadFormattedAsPdf, downloadFormattedAsDocx } from '@/lib/exportFormattedArticle';
import { injectOrcidsIntoFormattedHtml, type OrcidAuthorEntry } from '@/lib/orcid';

interface Props { articleId: string }

type FormattingStatus = 'pending' | 'formatting' | 'ready_for_review' | 'approved' | 'failed';

interface Suggestion {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'improvement';
}

export function FormattingSection({ articleId }: Props) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);

  const { data: article, isLoading } = useQuery({
    queryKey: ['admin-article-formatting', articleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', articleId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (query: any) =>
      query?.state?.data?.formatting_status === 'formatting' ? 3000 : false,
    refetchIntervalInBackground: true,
  });



  const formatMut = useMutation({
    mutationFn: async () => {
      const r = await supabase.functions.invoke('format-article', { body: { articleId } });
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-article-formatting', articleId] });
      qc.invalidateQueries({ queryKey: ['admin-article-detail', articleId] });
      toast.success('Formatting started — this may take a minute.');
    },
    onError: (e: any) => toast.error('Formatting failed: ' + e.message),
  });
  const orcidMut = useMutation({
    mutationFn: async () => {
      const a: any = article;
      if (!a) throw new Error('Article not loaded');
      const sourceField = a.author_revision_html ? 'author_revision_html' : 'formatted_content';
      const sourceHtml: string | null = a[sourceField];
      if (!sourceHtml) throw new Error('Format the article first');

      const [{ data: profile }, { data: cos }] = await Promise.all([
        supabase.from('profiles').select('orcid').eq('id', a.author_id).maybeSingle(),
        supabase.from('co_authors').select('name, orcid').eq('article_id', articleId).order('created_at', { ascending: true }),
      ]);

      const entries: OrcidAuthorEntry[] = [
        { index: 1, name: a.author_name || '', orcid: (profile as any)?.orcid || '' },
        ...((cos || []) as any[]).map((c, i) => ({ index: i + 2, name: c.name, orcid: c.orcid || '' })),
      ];

      const { html, added } = injectOrcidsIntoFormattedHtml(sourceHtml, entries);
      if (!added) return { added: 0 };
      const patch: any = sourceField === 'author_revision_html'
        ? { author_revision_html: html }
        : { formatted_content: html };
      const { error } = await supabase.from('articles').update(patch).eq('id', articleId);
      if (error) throw error;
      return { added };
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['admin-article-formatting', articleId] });
      qc.invalidateQueries({ queryKey: ['admin-article-detail', articleId] });
      toast[r.added ? 'success' : 'info'](
        r.added ? `Added ${r.added} ORCID iD${r.added > 1 ? 's' : ''} to the formatted article.` : 'No new ORCID iDs to add.',
      );
    },
    onError: (e: any) => toast.error('Could not add ORCID iDs: ' + e.message),
  });



  const status = ((article as any)?.formatting_status || 'pending') as FormattingStatus;
  const suggestions: Suggestion[] = ((article as any)?.formatting_suggestions as Suggestion[]) || [];
  const authorRevision = (article as any)?.author_revision_html as string | null;
  const formattedContent = (authorRevision || (article as any)?.formatted_content) as string | null;

  const handleDownload = async (kind: 'pdf' | 'word') => {
    if (!formattedContent) { toast.error('No formatted preview available yet.'); return; }
    const baseName = `formatted-${(article as any)?.reference_number || 'article'}`;
    try {
      toast.info(kind === 'word' ? 'Building Word file…' : 'Building PDF…');
      if (kind === 'word') await downloadFormattedAsDocx(formattedContent, baseName);
      else await downloadFormattedAsPdf(formattedContent, baseName);
      toast.success('Download ready');
    } catch (err: any) {
      toast.error('Failed to generate file: ' + (err?.message || 'unknown'));
    }
  };

  const statusBadge = () => {
    const cfg: Record<FormattingStatus, { icon: any; label: string; variant: any }> = {
      pending: { icon: Clock, label: 'Not Formatted', variant: 'secondary' },
      formatting: { icon: RefreshCw, label: 'Formatting...', variant: 'default' },
      ready_for_review: { icon: Edit, label: 'Ready to Edit & Review', variant: 'destructive' },
      approved: { icon: CheckCircle, label: 'Approved & Sent', variant: 'default' },
      failed: { icon: XCircle, label: 'Failed', variant: 'destructive' },
    };
    const c = cfg[status] || cfg.pending; const Icon = c.icon;
    return <Badge variant={c.variant} className="flex items-center gap-1"><Icon className="w-3 h-3" />{c.label}</Badge>;
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" /> Article Formatting
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {statusBadge()}
          {status !== 'formatting' && (
            <Button variant="outline" size="sm" onClick={() => formatMut.mutate()} disabled={formatMut.isPending}>
              {formatMut.isPending ? <><GlassSpinner size="sm" className="mr-2" />Formatting...</>
                : status === 'pending' || status === 'failed'
                  ? <><Wand2 className="w-4 h-4 mr-2" />Format</>
                  : <><RefreshCw className="w-4 h-4 mr-2" />Re-format</>}
            </Button>
          )}
          {formattedContent && (
            <Button variant={editorOpen ? 'default' : 'outline'} size="sm" onClick={() => setEditorOpen((v) => !v)}>
              <Edit className="w-4 h-4 mr-2" />{editorOpen ? 'Close Editor' : 'Edit Article'}
            </Button>
          )}
          {formattedContent && (
            <DownloadButton size="sm" onDownload={() => handleDownload('pdf')}>Download PDF</DownloadButton>
          )}
          {formattedContent && (
            <DownloadButton size="sm" onDownload={() => handleDownload('word')}>Download Word</DownloadButton>
          )}
        </div>
      </div>

      {isLoading && <div className="py-6 flex justify-center"><GlassSpinner /></div>}

      {!isLoading && !formattedContent && status !== 'formatting' && (
        <p className="text-sm text-muted-foreground py-2">Click Format to generate the AI-formatted version of this article.</p>
      )}

      {editorOpen && formattedContent && article && (
        <div className="mt-4">
          <ArticleContentEditor
            articleId={articleId}
            initialContent={formattedContent}
            articleTitle={(article as any).title}
            referenceNumber={(article as any).reference_number}
            onClose={() => setEditorOpen(false)}
          />
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[hsl(var(--glass-border))]">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" /> AI Formatting Suggestions
          </h4>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-[hsl(var(--glass-bg))]">
                {s.severity === 'warning' ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  : s.severity === 'improvement' ? <Wand2 className="w-4 h-4 text-primary shrink-0" />
                  : <Info className="w-4 h-4 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{s.type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">{s.message}</p>
                </div>
                <Badge variant={s.severity === 'warning' ? 'destructive' : s.severity === 'improvement' ? 'default' : 'secondary'} className="shrink-0 text-xs">
                  {s.severity}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
