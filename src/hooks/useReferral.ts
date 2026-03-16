import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ReferralInfo {
  referralCode: string | null;
  isIndian: boolean;
  totalReferred: number;
  totalRewarded: number;
  currentTierDiscount: number;
  nextTierDiscount: number | null;
  referralsToNextTier: number;
  currencySymbol: string;
  discountCodes: Array<{
    code: string;
    discount_value: number;
    currency: string;
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

function getTierInfo(totalRewarded: number, isIndian: boolean) {
  const tiers = isIndian
    ? { t1: 500, t2: 1000, t3: 1500 }
    : { t1: 10, t2: 30, t3: 50 };
  if (totalRewarded >= 3) return { current: tiers.t3, next: null, remaining: 0 };
  if (totalRewarded === 2) return { current: tiers.t2, next: tiers.t3, remaining: 1 };
  if (totalRewarded === 1) return { current: tiers.t1, next: tiers.t2, remaining: 1 };
  return { current: 0, next: tiers.t1, remaining: 1 };
}

export function useReferral() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['profile-referral', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('referral_code, is_indian')
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
        .select('code, discount_value, currency, is_active, used_count')
        .eq('created_by', user!.id)
        .like('code', 'REF-%')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const isIndian = profile?.is_indian ?? false;
  const totalReferred = referrals.length;
  const totalRewarded = referrals.filter((r: any) => r.reward_granted).length;
  const tier = getTierInfo(totalRewarded, isIndian);
  const currencySymbol = isIndian ? '₹' : '$';

  const info: ReferralInfo = {
    referralCode: profile?.referral_code ?? null,
    isIndian,
    totalReferred,
    totalRewarded,
    currentTierDiscount: tier.current,
    nextTierDiscount: tier.next,
    referralsToNextTier: tier.remaining,
    currencySymbol,
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
