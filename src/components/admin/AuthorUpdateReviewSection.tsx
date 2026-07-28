import React from 'react';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Send } from 'lucide-react';

interface Props {
  article: any;
  invalidateKeys?: any[][];
}

export function AuthorUpdateReviewSection({ article, invalidateKeys = [] }: Props) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const state = article?.author_update_status;
  if (!state || state === 'none' || !article?.author_update_html) return null;

  const invalidate = () => invalidateKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));

  const setState = async (next: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from('articles')
        .update({ author_update_status: next, author_update_notes: notes || null } as any)
        .eq('id', article.id);
      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: article.author_id,
        title: next === 'approved' ? 'Update Approved ✅' : 'Update Rejected',
        message:
          next === 'approved'
            ? `Your requested changes for "${article.title}" were approved and will be applied.`
            : `Your requested changes for "${article.title}" were not approved.${notes ? ' Note: ' + notes : ''}`,
        type: next === 'approved' ? 'success' : 'warning',
        link: `/author/articles/${article.id}`,
      });

      toast.success(next === 'approved' ? 'Changes approved' : 'Changes rejected');
      invalidate();
    } catch (e: any) {
      toast.error('Failed: ' + (e.message || 'unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const updateAndPublish = async () => {
    setBusy(true);
    try {
      const formatted = article.formatted_content || '';
      const cleaned = String(article.author_update_html).replace(/color:#d00/g, 'color:inherit');
      const { error } = await supabase
        .from('articles')
        .update({
          status: 'updated_published',
          author_update_status: 'none',
          author_update_html: null,
          formatted_content: formatted ? `${formatted}\n${cleaned}` : cleaned,
        } as any)
        .eq('id', article.id);
      if (error) throw error;

      // Refresh certificate with the updated details (best effort)
      supabase.functions
        .invoke('generate-certificate', { body: { articleId: article.id } })
        .catch(() => undefined);

      await supabase.from('notifications').insert({
        user_id: article.author_id,
        title: 'Updated & Published 🎉',
        message: `The updated version of "${article.title}" is now published. Your certificate and publication card reflect the new details.`,
        type: 'success',
        link: `/author/articles/${article.id}`,
      });

      toast.success('Updated version published');
      invalidate();
    } catch (e: any) {
      toast.error('Failed to publish update: ' + (e.message || 'unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Author Update Request</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--glass-bg-strong))] capitalize">{state}</span>
      </div>
      {article.author_update_submitted_at && (
        <p className="text-xs text-muted-foreground mb-3">
          Submitted {new Date(article.author_update_submitted_at).toLocaleString()}
        </p>
      )}
      <div
        className="prose prose-sm max-w-none dark:prose-invert overflow-x-auto p-3 rounded-lg bg-[hsl(var(--glass-bg))]"
        dangerouslySetInnerHTML={{ __html: article.author_update_html }}
      />

      {state === 'pending' && (
        <div className="mt-4 space-y-3">
          <Textarea
            rows={2}
            placeholder="Optional note to the author…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gradient-primary" disabled={busy} onClick={() => setState('approved')}>
              <CheckCircle className="w-4 h-4 mr-1" /> Approve Changes
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setState('rejected')}>
              <XCircle className="w-4 h-4 mr-1" /> Reject
            </Button>
          </div>
        </div>
      )}

      {state === 'approved' && (
        <div className="mt-4">
          <Button size="sm" className="gradient-primary" disabled={busy} onClick={updateAndPublish}>
            <Send className="w-4 h-4 mr-1" /> Update & Publish
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Applies the changes to the formatted article, refreshes the certificate and publication card, and sets the
            status to Updated &amp; Published.
          </p>
        </div>
      )}
    </GlassCard>
  );
}
