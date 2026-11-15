import { supabase } from '@/integrations/supabase/client';
import { queryTimeout } from '@/lib/queryTimeout';

type PageResult<T> = { data: T[] | null; error: unknown };

export async function collectAuthorProfilePages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export function fetchAdminAuthorProfiles() {
  return collectAuthorProfilePages((from, to) => supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to)
    .abortSignal(queryTimeout()));
}