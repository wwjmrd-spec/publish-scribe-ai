import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
}

const FREE_REVIEW_LIMIT = 2; // lifetime, not monthly
const PRO_REVIEW_LIMIT = 5; // per month
const PRO_COAUTHOR_LIMIT = 4; // per month

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function useSubscription() {
  const { user } = useAuth();
  const currentMonth = getCurrentMonth();

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

      // Check if pro subscription has expired
      if (data && data.plan_type === 'pro' && data.expires_at) {
        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
          // Mark as inactive
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

  // Current month usage (for Pro plan monthly limits)
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

  // Lifetime usage (for Free plan total limits)
  const { data: lifetimeUsage, isLoading: lifetimeLoading } = useQuery({
    queryKey: ['plan-usage-lifetime', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_usage')
        .select('review_reports_used, coauthor_certs_used')
        .eq('user_id', user!.id);

      if (error) throw error;
      return {
        review_reports_used: (data || []).reduce((sum, row) => sum + (row.review_reports_used || 0), 0),
        coauthor_certs_used: (data || []).reduce((sum, row) => sum + (row.coauthor_certs_used || 0), 0),
      };
    },
    enabled: !!user?.id,
  });

  const isPro = subscription?.plan_type === 'pro';
  const plan = isPro ? 'pro' : 'free';

  // For Pro: use current month usage; For Free: use lifetime usage
  const reviewReportsUsed = isPro
    ? (usage?.review_reports_used ?? 0)
    : (lifetimeUsage?.review_reports_used ?? 0);
  const coauthorCertsUsed = isPro
    ? (usage?.coauthor_certs_used ?? 0)
    : (lifetimeUsage?.coauthor_certs_used ?? 0);

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
  };

  return {
    subscription: info,
    isLoading: subLoading || usageLoading || lifetimeLoading,
    currentMonth,
  };
}

export async function incrementUsage(
  userId: string,
  field: 'review_reports_used' | 'coauthor_certs_used'
) {
  const currentMonth = getCurrentMonth();

  // Try to upsert usage
  const { data: existing } = await supabase
    .from('plan_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('usage_month', currentMonth)
    .maybeSingle();

  if (existing) {
    const newValue = (field === 'review_reports_used'
      ? existing.review_reports_used
      : existing.coauthor_certs_used) + 1;

    await supabase
      .from('plan_usage')
      .update({ [field]: newValue, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('plan_usage')
      .insert({
        user_id: userId,
        usage_month: currentMonth,
        [field]: 1,
      });
  }
}
