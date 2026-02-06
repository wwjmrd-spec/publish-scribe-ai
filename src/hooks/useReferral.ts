import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ReferralInfo {
  referralCode: string | null;
  totalReferred: number;
  totalRewarded: number;
  bonusDownloads: number;
  referrals: Array<{
    id: string;
    referred_email: string;
    status: string;
    reward_granted: boolean;
    created_at: string;
    rewarded_at: string | null;
  }>;
}

export function useReferral() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['profile-referral', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['my-referrals', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('*, referred:profiles!referrals_referred_id_fkey(email)')
        .eq('referrer_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const totalReferred = referrals.length;
  const totalRewarded = referrals.filter((r: any) => r.reward_granted).length;

  const info: ReferralInfo = {
    referralCode: profile?.referral_code ?? null,
    totalReferred,
    totalRewarded,
    bonusDownloads: totalRewarded * 2,
    referrals: referrals.map((r: any) => ({
      id: r.id,
      referred_email: r.referred?.email ?? 'Unknown',
      status: r.status,
      reward_granted: r.reward_granted,
      created_at: r.created_at,
      rewarded_at: r.rewarded_at,
    })),
  };

  return { referral: info, isLoading };
}
