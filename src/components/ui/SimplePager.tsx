import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SimplePagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function SimplePager({ page, pageSize, total, onPageChange, className }: SimplePagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build a compact page list: first, current-1, current, current+1, last
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const visible = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap mt-6 pt-4 border-t border-[hsl(var(--glass-border))] ${className || ''}`}>
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start}</span>–
        <span className="font-medium text-foreground">{end}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        {visible.map((p, idx) => {
          const prev = visible[idx - 1];
          const gap = prev && p - prev > 1;
          return (
            <React.Fragment key={p}>
              {gap && <span className="px-1 text-muted-foreground">…</span>}
              <Button
                size="sm"
                variant={p === page ? 'default' : 'ghost'}
                className="min-w-[2rem] h-8 px-2"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            </React.Fragment>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
