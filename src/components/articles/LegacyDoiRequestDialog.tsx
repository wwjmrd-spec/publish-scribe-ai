import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PayOptionsDialog } from '@/components/articles/PayOptionsDialog';
import { Link2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lets an author buy a DOI for an article WWJMRD published in a past issue,
 * by entering the article title and reference number.
 */
export function LegacyDoiRequestDialog({ open, onOpenChange }: Props) {
  const { user, isIndian } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState('');
  const [ref, setRef] = React.useState('');
  const [link, setLink] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [requestId, setRequestId] = React.useState<string | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);

  const { data: fees } = useQuery({
    queryKey: ['doi-fees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('publication_fees_public' as any)
        .select('indian_doi_fee, international_doi_fee')
        .maybeSingle();
      return data as any;
    },
  });

  const doiInr = Number(fees?.indian_doi_fee ?? 500);
  const doiUsd = Number(fees?.international_doi_fee ?? 10);
  const amount = isIndian ? doiInr : doiUsd;
  const priceLabel = isIndian ? `₹${doiInr}` : `$${doiUsd}`;

  const submit = async () => {
    if (!user) return;
    if (!title.trim() || !ref.trim()) {
      toast.error('Please enter both the article title and the reference number.');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('legacy_doi_requests' as any)
        .insert({
          user_id: user.id,
          article_title: title.trim(),
          reference_number: ref.trim(),
          published_link: link.trim() || null,
          notes: notes.trim() || null,
        } as any)
        .select('id')
        .single();
      if (error) throw error;
      setRequestId((data as any).id);
      onOpenChange(false);
      setPayOpen(true);
    } catch (e: any) {
      toast.error('Could not create the DOI request: ' + (e.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" /> DOI for a previously published article
            </DialogTitle>
            <DialogDescription>
              Already published with WWJMRD in a past issue? Enter the article details and pay {priceLabel} to get a
              DOI for it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Article title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Full article title" />
            </div>
            <div>
              <Label className="text-xs">Article reference number *</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. ART-2024-0123" />
            </div>
            <div>
              <Label className="text-xs">Published article link (optional)</Label>
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://wwjmrd.com/..." />
            </div>
            <div>
              <Label className="text-xs">Notes for the editor (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button className="gradient-primary" onClick={submit} disabled={saving}>
              Continue to pay {priceLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {requestId && (
        <PayOptionsDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          title="DOI for a past-issue article"
          description={
            <>
              DOI registration for <span className="font-semibold text-foreground">{title}</span> ({ref}). Fee:{' '}
              <span className="font-semibold text-foreground">{priceLabel}</span>.
            </>
          }
          items={[{ type: 'legacy_doi', requestId }]}
          inrAmount={doiInr}
          usdAmount={doiUsd}
          cartItem={{
            id: `legacy_doi-${requestId}`,
            type: 'legacy_doi',
            label: `DOI (past issue) — ${ref}`,
            description: title,
            amount,
            requestId,
          }}
          onPaid={() => {
            queryClient.invalidateQueries({ queryKey: ['legacy-doi-requests'] });
            toast.success('DOI payment received. We will register your DOI shortly.');
            setTitle(''); setRef(''); setLink(''); setNotes(''); setRequestId(null);
          }}
        />
      )}
    </>
  );
}
