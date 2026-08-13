import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/** Reads the author's saved "How did you hear about us?" answer from their profile. */
export function useDiscoveryAnswer() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['profile-discovery', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('discovery_source, discovery_details')
        .eq('id', user!.id)
        .maybeSingle();
      return (data as any) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  return {
    ...query,
    source: (query.data?.discovery_source as string | null) ?? null,
    details: query.data?.discovery_details ?? null,
    answered: !!query.data?.discovery_source,
  };
}
