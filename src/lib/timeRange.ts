import { subMonths, subYears, startOfWeek } from 'date-fns';

export type RangeKey = 'week' | 'month' | '3m' | '6m' | '1y' | 'all';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All Time' },
];

export function getRangeStart(range: RangeKey): Date | null {
  const now = new Date();
  switch (range) {
    case 'week': return startOfWeek(now, { weekStartsOn: 0 });
    case 'month': return subMonths(now, 1);
    case '3m': return subMonths(now, 3);
    case '6m': return subMonths(now, 6);
    case '1y': return subYears(now, 1);
    case 'all': return null;
  }
}

export function inRange(dateStr: string | null | undefined, start: Date | null, end: Date = new Date()): boolean {
  if (!dateStr) return false;
  if (!start) return true;
  const dt = new Date(dateStr);
  return dt >= start && dt <= end;
}
