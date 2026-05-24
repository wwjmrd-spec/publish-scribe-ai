import { useEffect, useState } from 'react';
import type { RangeKey } from '@/lib/timeRange';

const STORAGE_KEY = 'admin-dashboard-range';
const EVENT = 'admin-dashboard-range-change';

function read(): RangeKey {
  if (typeof window === 'undefined') return 'week';
  const v = window.localStorage.getItem(STORAGE_KEY) as RangeKey | null;
  return v || 'week';
}

export function useDashboardRange(): [RangeKey, (r: RangeKey) => void] {
  const [range, setRange] = useState<RangeKey>(read);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<RangeKey>).detail;
      if (detail) setRange(detail);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const update = (r: RangeKey) => {
    window.localStorage.setItem(STORAGE_KEY, r);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: r }));
    setRange(r);
  };

  return [range, update];
}
