import React from 'react';
import { format } from 'date-fns';
import { CalendarClock } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// The journal's last fee submission day of every month.
export const LAST_FEE_DAY = 25;

export type FeePromiseArticle = {
  id: string;
  title: string;
  reference_number: string;
  status: string;
  fee_promise_status?: string | null;
  fee_promise_date?: string | null;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Latest date an author may promise: the 25th of the current month.
 * After the 25th has passed, the 25th of the next month is offered instead.
 */
export const feePromiseDeadline = (now: Date = new Date()) =>
  now.getDate() <= LAST_FEE_DAY
    ? new Date(now.getFullYear(), now.getMonth(), LAST_FEE_DAY)
    : new Date(now.getFullYear(), now.getMonth() + 1, LAST_FEE_DAY);

/** Statuses where the fee promise still matters (fee not paid yet). */
export function feePromiseApplies(article: FeePromiseArticle): boolean {
  return ['manuscript_accepted', 'pending_fee'].includes(article.status);
}

/**
 * Auto-prompt rules:
 * - only while the fee is unpaid (accepted / pending fee)
 * - never before the 26th of the month if no room is left this month
 * - once a date is chosen, stay quiet until that date arrives
 */
export function canAskFeePromise(article: FeePromiseArticle, now: Date = new Date()): boolean {
  if (!feePromiseApplies(article)) return false;

  if (article.fee_promise_date) {
    const promised = new Date(article.fee_promise_date + 'T00:00:00');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Stay silent until the promised date arrives.
    return promised.getTime() <= today.getTime();
  }

  if (article.fee_promise_status && article.fee_promise_status !== 'unasked') return false;
  return now.getDate() <= LAST_FEE_DAY;
}

/** Pick the first article that should trigger the prompt. */
export function findFeePromiseTarget(articles: any[] | undefined): FeePromiseArticle | null {
  if (!articles?.length) return null;
  return (articles.find((a) => canAskFeePromise(a)) as FeePromiseArticle) || null;
}

interface Props {
  article: FeePromiseArticle;
  open: boolean;
  /** Dismiss without recording anything — the prompt reappears next visit. */
  onClose: () => void;
  onSaved?: () => void;
}


export function FeePromiseDialog({ article, open, onClose, onSaved }: Props) {
  const existing = article.fee_promise_date
    ? new Date(article.fee_promise_date + 'T00:00:00')
    : undefined;
  const [date, setDate] = React.useState<Date | undefined>(existing);
  const [saving, setSaving] = React.useState(false);

  const today = startOfToday();
  const deadline = feePromiseDeadline();


  const save = async (promise: Date | null) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_fee_promise' as any, {
        p_article_id: article.id,
        p_date: promise ? format(promise, 'yyyy-MM-dd') : null,
      });
      if (error) throw error;

      toast.success(
        promise
          ? `Thanks! We'll remind you from ${format(promise, 'PPP')}.`
          : 'No problem — we will keep sending the usual fee reminders.',
      );
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error('Could not save your date: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            When do you plan to pay the fee?
          </DialogTitle>
          <DialogDescription>
            Your manuscript <span className="font-medium text-foreground">{article.title}</span>{' '}
            ({article.reference_number}) is accepted. Pick the date you plan to submit the
            publication fee. Reminder emails will start from that date.
            {existing && (
              <>
                {' '}Currently set to{' '}
                <span className="font-medium text-foreground">{format(existing, 'PPP')}</span>.
              </>
            )}{' '}
            The last fee submission date available is {format(deadline, 'PPP')}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            defaultMonth={today}
            fromDate={today}
            toDate={deadline}
            disabled={{ before: today, after: deadline }}
            className={cn('p-3 pointer-events-auto')}
          />
        </div>


        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="sm:mr-auto">
            Close
          </Button>
          <Button variant="outline" onClick={() => save(null)} disabled={saving}>
            Skip
          </Button>
          <Button
            onClick={() => date && save(date)}
            disabled={saving || !date}
            className="gradient-primary"
          >
            {saving ? 'Saving…' : 'Confirm date'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
