import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ReferralInfo {
  referralCode: string | null;
  totalReferred: number;
  totalRewarded: number;
  currentTierDiscount: number;
  nextTierDiscount: number | null;
  referralsToNextTier: number;
  discountCodes: Array<{
    code: string;
    discount_value: number;
    is_active: boolean;
    used_count: number;
  }>;
  referrals: Array<{
    id: string;
    referred_email: string;
    status: string;
    reward_granted: boolean;
    created_at: string;
    rewarded_at: string | null;
  }>;
}

function getTierInfo(totalRewarded: number) {
  if (totalRewarded >= 3) return { current: 50, next: null, remaining: 0 };
  if (totalRewarded === 2) return { current: 30, next: 50, remaining: 1 };
  if (totalRewarded === 1) return { current: 10, next: 30, remaining: 1 };
  return { current: 0, next: 10, remaining: 1 };
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

  const { data: discountCodes = [] } = useQuery({
    queryKey: ['referral-discount-codes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discount_codes')
        .select('code, discount_value, is_active, used_count')
        .eq('created_by', user!.id)
        .like('code', 'REF-%')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const totalReferred = referrals.length;
  const totalRewarded = referrals.filter((r: any) => r.reward_granted).length;
  const tier = getTierInfo(totalRewarded);

  const info: ReferralInfo = {
    referralCode: profile?.referral_code ?? null,
    totalReferred,
    totalRewarded,
    currentTierDiscount: tier.current,
    nextTierDiscount: tier.next,
    referralsToNextTier: tier.remaining,
    discountCodes: discountCodes as any,
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
