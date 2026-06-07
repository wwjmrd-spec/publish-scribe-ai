import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getFreePeriodKey } from '@/lib/planPeriod';

export interface SubscriptionInfo {
  plan: 'free' | 'pro';
  isActive: boolean;
  expiresAt: string | null;
  reviewReportsUsed: number;
  reviewReportsLimit: number;
  coauthorCertsUsed: number;
  coauthorCertsLimit: number;
  canDownloadReport: boolean;
  canCreateCoauthorCert: boolean;
  /** Period key currently in effect for the free plan (anchored to signup date). */
  freePeriodKey: string | null;
}

const FREE_REVIEW_LIMIT = 2; // per monthly period, anchored to signup date
const PRO_REVIEW_LIMIT = 5; // per calendar month
const PRO_COAUTHOR_LIMIT = 4; // per calendar month

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function useSubscription() {
  const { user } = useAuth();
  const currentMonth = getCurrentMonth();

  const { data: profile } = useQuery({
    queryKey: ['user-profile-created', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const freePeriodKey = profile?.created_at
    ? getFreePeriodKey(profile.created_at)
    : null;

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['user-subscription', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data && data.plan_type === 'pro' && data.expires_at) {
        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
          await supabase
            .from('user_subscriptions')
            .update({ is_active: false })
            .eq('id', data.id);
          return null;
        }
      }

      return data;
    },
    enabled: !!user?.id,
  });

  // Pro plan: current calendar month
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['plan-usage', user?.id, currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_usage')
        .select('*')
        .eq('user_id', user!.id)
        .eq('usage_month', currentMonth)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Free plan: current period (signup-anchored month)
  const { data: freeUsage, isLoading: freeUsageLoading } = useQuery({
    queryKey: ['plan-usage-free-period', user?.id, freePeriodKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_usage')
        .select('review_reports_used, coauthor_certs_used')
        .eq('user_id', user!.id)
        .eq('usage_month', freePeriodKey!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!freePeriodKey,
  });

  const isPro = subscription?.plan_type === 'pro';
  const plan: 'free' | 'pro' = isPro ? 'pro' : 'free';

  const reviewReportsUsed = isPro
    ? (usage?.review_reports_used ?? 0)
    : (freeUsage?.review_reports_used ?? 0);
  const coauthorCertsUsed = isPro
    ? (usage?.coauthor_certs_used ?? 0)
    : (freeUsage?.coauthor_certs_used ?? 0);

  const reviewReportsLimit = isPro ? PRO_REVIEW_LIMIT : FREE_REVIEW_LIMIT;
  const coauthorCertsLimit = isPro ? PRO_COAUTHOR_LIMIT : 0;

  const info: SubscriptionInfo = {
    plan,
    isActive: isPro && !!subscription?.is_active,
    expiresAt: subscription?.expires_at ?? null,
    reviewReportsUsed,
    reviewReportsLimit,
    coauthorCertsUsed,
    coauthorCertsLimit,
    canDownloadReport: reviewReportsUsed < reviewReportsLimit,
    canCreateCoauthorCert: isPro && coauthorCertsUsed < coauthorCertsLimit,
    freePeriodKey,
  };

  return {
    subscription: info,
    isLoading: subLoading || usageLoading || freeUsageLoading,
    currentMonth,
    freePeriodKey,
  };
}

export async function incrementUsage(
  userId: string,
  field: 'review_reports_used' | 'coauthor_certs_used',
  periodKey?: string,
) {
  const key = periodKey || getCurrentMonth();

  const { error } = await supabase.rpc('increment_plan_usage' as any, {
    p_user_id: userId,
    p_field: field,
    p_usage_month: key,
  });

  if (error) {
    console.error('Failed to increment usage:', error.message);
    throw error;
  }
}
