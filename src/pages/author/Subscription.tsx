import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useSubscription } from '@/hooks/useSubscription';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Crown,
  Check,
  X,
  Zap,
  FileText,
  Users,
  Clock,
  Sparkles,
} from 'lucide-react';

export default function Subscription() {
  const { user, userRole, isIndian } = useAuth();
  const { subscription, isLoading } = useSubscription();
  const currencySymbol = isIndian ? '₹' : '$';

  const { data: fees } = useQuery({
    queryKey: ['publication-fees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('publication_fees')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const proFee = fees
    ? isIndian
      ? Number(fees.indian_pro_fee)
      : Number(fees.international_pro_fee)
    : isIndian
    ? 999
    : 19;

  const handleUpgradeToPro = async () => {
    if (!user) return;

    try {
      // Calculate expiry (1 month from now)
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const { error } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          plan_type: 'pro',
          starts_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          is_active: true,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('You already have an active subscription');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Upgraded to Pro! Your plan is active for 1 month.');
      // Refetch subscription data
      window.location.reload();
    } catch (err: any) {
      toast.error('Failed to upgrade: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout type={userRole === 'admin' ? 'admin' : 'author'}>
        <div className="flex items-center justify-center h-64">
          <GlassSpinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  const isPro = subscription.plan === 'pro';

  return (
    <DashboardLayout type={userRole === 'admin' ? 'admin' : 'author'}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center glow-purple">
              <Crown className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Subscription Plans</h1>
              <p className="text-muted-foreground">Choose the plan that fits your needs</p>
            </div>
          </div>
        </div>

        {/* Current Plan Banner */}
        {isPro && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8"
          >
            <GlassCard className="border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-lg">You're on the Pro Plan!</h3>
                    <p className="text-sm text-muted-foreground">
                      Expires on {new Date(subscription.expiresAt!).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  {Math.max(0, Math.ceil((new Date(subscription.expiresAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days remaining
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Usage Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard>
              <div className="flex items-center gap-3 mb-3">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Review Reports This Month</h3>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">{subscription.reviewReportsUsed}</span>
                <span className="text-muted-foreground mb-1">/ {subscription.reviewReportsLimit}</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (subscription.reviewReportsUsed / subscription.reviewReportsLimit) * 100)}%` }}
                />
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <GlassCard>
              <div className="flex items-center gap-3 mb-3">
                <Users className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Co-Author Certificates This Month</h3>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">{subscription.coauthorCertsUsed}</span>
                <span className="text-muted-foreground mb-1">/ {isPro ? subscription.coauthorCertsLimit : '0 (Pro only)'}</span>
              </div>
              {isPro && (
                <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (subscription.coauthorCertsUsed / subscription.coauthorCertsLimit) * 100)}%` }}
                  />
                </div>
              )}
            </GlassCard>
          </motion.div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Free Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard className={!isPro ? 'ring-2 ring-primary/50' : ''}>
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-7 h-7 text-muted-foreground" />
                </div>
                <h2 className="font-display text-2xl font-bold">Free</h2>
                <p className="text-3xl font-bold mt-2">
                  {currencySymbol}0
                </p>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  <span>2 review report downloads (total)</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <X className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-muted-foreground">No co-author certificates</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  <span>Unlimited article submissions</span>
                </li>
              </ul>

              {!isPro && (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              )}
            </GlassCard>
          </motion.div>

          {/* Pro Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <GlassCard className={isPro ? 'ring-2 ring-primary/50' : 'border-primary/20'}>
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center mx-auto mb-4 glow-purple">
                  <Crown className="w-7 h-7 text-primary-foreground" />
                </div>
                <h2 className="font-display text-2xl font-bold">Pro</h2>
                <p className="text-3xl font-bold mt-2">
                  {currencySymbol}{proFee}
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                </p>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  <span>5 review report downloads/month</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  <span>4 co-author certificates/month</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  <span>Unlimited article submissions</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  <span>Valid for 1 month</span>
                </li>
              </ul>

              {isPro ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button
                  className="w-full gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
                  onClick={handleUpgradeToPro}
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Pro — {currencySymbol}{proFee}/month
                </Button>
              )}
            </GlassCard>
          </motion.div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
