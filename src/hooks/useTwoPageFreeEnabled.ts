import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Whether the admin's "2-Page Free Publication" switch is on (off by default). */
export function useTwoPageFreeEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['two-page-free-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_two_page_free_enabled');
      if (error) return false;
      return data === true;
    },
    staleTime: 60_000,
  });
  return data === true;
}
