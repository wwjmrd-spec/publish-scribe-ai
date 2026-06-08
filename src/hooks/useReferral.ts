import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ReferralInfo {
  referralCode: string | null;
  isIndian: boolean;
  totalReferred: number;
  totalRewarded: number;
  referrerPct: number; // 15
  refereePct: number;  // 10
  currencySymbol: string;
  discountCodes: Array<{
    code: string;
    discount_value: number;
    discount_type: string;
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
        .select('code, discount_value, discount_type, currency, is_active, used_count')
        .eq('created_by', user!.id)
        .or('code.like.REF-%,code.like.WELCOME-%')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const isIndian = profile?.is_indian ?? false;
  const totalReferred = referrals.length;
  const totalRewarded = referrals.filter((r: any) => r.reward_granted).length;
  const currencySymbol = isIndian ? '₹' : '$';

  const info: ReferralInfo = {
    referralCode: profile?.referral_code ?? null,
    isIndian,
    totalReferred,
    totalRewarded,
    referrerPct: 15,
    refereePct: 10,
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
