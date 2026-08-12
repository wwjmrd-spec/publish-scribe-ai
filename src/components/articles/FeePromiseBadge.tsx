import React from 'react';
import { format } from 'date-fns';
import { CalendarClock, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FeePromiseDialog, feePromiseApplies, type FeePromiseArticle,
} from '@/components/articles/FeePromiseDialog';

interface Props {
  article: FeePromiseArticle;
  onSaved?: () => void;
  /** Compact pill only (list rows) vs. pill + change button (detail page). */
  compact?: boolean;
}

/**
 * Shows the fee due date the author promised, with the option to change it any time.
 */
export function FeePromiseBadge({ article, onSaved, compact }: Props) {
  const [open, setOpen] = React.useState(false);
  if (!feePromiseApplies(article)) return null;

  const promised = article.fee_promise_date
    ? new Date(article.fee_promise_date + 'T00:00:00')
    : null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
        title="Change your planned fee payment date"
      >
        <CalendarClock className="w-3 h-3" />
        {promised ? `Fee due ${format(promised, 'd MMM yyyy')}` : 'Set fee date'}
        {!compact && <Pencil className="w-3 h-3 ml-1" />}
      </button>

      {open && (
        <FeePromiseDialog
          article={article}
          open
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
