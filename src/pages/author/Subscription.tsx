import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useSubscription } from '@/hooks/useSubscription';
import { useRazorpay } from '@/hooks/useRazorpay';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ShoppingCart,
  RefreshCw,
  CreditCard,
} from 'lucide-react';

export default function Subscription() {
  const { user, userRole, isIndian } = useAuth();
  const { subscription, isLoading } = useSubscription();
  const { addItem, hasItem } = useCart();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currencySymbol = isIndian ? '₹' : '$';
  const { isLoaded: razorpayLoaded } = useRazorpay();
  const [searchParams] = useSearchParams();
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Handle PayPal subscription return
  useEffect(() => {
    const paypalSub = searchParams.get('paypal_sub');
    if (paypalSub === 'success') {
      toast.success('PayPal subscription activated! It may take a moment to reflect.');
      queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['active-sub-record'] });
    } else if (paypalSub === 'cancelled') {
      toast.info('PayPal subscription was cancelled.');
    }
  }, [searchParams, queryClient]);

  const { data: fees } = useQuery({
    queryKey: ['publication-fees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('publication_fees_public' as any)
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: activeSubRecord } = useQuery({
    queryKey: ['active-sub-record', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        .eq('plan_type', 'pro')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const cancelAutoRenew = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cancel-recurring-subscription');
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-sub-record'] });
      queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
      toast.success('Auto-pay has been cancelled. Your plan remains active until expiry.');
    },
    onError: (err) => toast.error(err.message || 'Failed to cancel auto-pay'),
  });

  const toggleAutoRenew = useMutation({
    mutationFn: async (newValue: boolean) => {
      if (newValue) {
        // Re-enabling auto-renew means creating a new recurring subscription
        // For simplicity, just update the flag - next renewal will be handled
        if (!activeSubRecord) throw new Error('No active subscription');
        const { error } = await supabase
          .from('user_subscriptions')
          .update({ auto_renew: true } as any)
          .eq('id', activeSubRecord.id);
        if (error) throw error;
      } else {
        // Cancel auto-renewal on the payment gateway
        await cancelAutoRenew.mutateAsync();
        return;
      }
    },
    onSuccess: (_, newValue) => {
      if (newValue) {
        queryClient.invalidateQueries({ queryKey: ['active-sub-record'] });
        toast.success('Auto-pay enabled!');
      }
    },
    onError: (err) => {
      if (err.message !== 'Failed to cancel auto-pay') {
        toast.error('Failed to update auto-pay setting');
      }
    },
  });

  const proFee = fees
    ? isIndian
      ? Number(fees.indian_pro_fee)
      : Number(fees.international_pro_fee)
    : isIndian
    ? 999
    : 19;

  const proAlreadyInCart = hasItem('pro_subscription');

  const handleSubscribeRecurring = async (gateway: 'razorpay' | 'paypal') => {
    setIsSubscribing(true);
    try {
      const currency = isIndian ? 'INR' : 'USD';
      const { data, error } = await supabase.functions.invoke('create-recurring-subscription', {
        body: { gateway, currency },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (gateway === 'razorpay' && data.subscriptionId) {
        if (!window.Razorpay) {
          throw new Error('Razorpay SDK not loaded');
        }

        const options = {
          key: data.keyId,
          subscription_id: data.subscriptionId,
          name: 'WWJMRD',
          description: 'Pro Plan — Monthly Subscription',
          handler: async () => {
            toast.success('Subscription activated! It may take a moment to reflect.');
            queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
            queryClient.invalidateQueries({ queryKey: ['active-sub-record'] });
          },
          prefill: { email: user?.email },
          theme: { color: '#00d4ff' },
          modal: {
            ondismiss: () => {
              setIsSubscribing(false);
              toast.info('Subscription flow cancelled.');
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        return; // Don't set isSubscribing to false yet
      }

      if (gateway === 'paypal' && data.approvalUrl) {
        window.location.href = data.approvalUrl;
        return;
      }

      throw new Error('Unexpected response from subscription service');
    } catch (err: any) {
      console.error('Subscription error:', err);
      toast.error(err.message || 'Failed to start subscription');
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleAddToCart = () => {
    if (proAlreadyInCart) {
      navigate('/author/cart');
      return;
    }
    addItem({
      id: 'pro_subscription',
      type: 'pro_subscription',
      label: 'Pro Plan Subscription',
      description: '1 Month — 5 review reports, 4 co-author certificates',
      amount: proFee,
    });
    toast.success('Pro Plan added to cart!');
    navigate('/author/cart');
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
  const autoRenewEnabled = (activeSubRecord as any)?.auto_renew ?? false;
  const hasRecurringSub = !!(activeSubRecord as any)?.razorpay_subscription_id || !!(activeSubRecord as any)?.paypal_subscription_id;

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
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    {Math.max(0, Math.ceil((new Date(subscription.expiresAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days remaining
                  </div>
                </div>
              </div>

              {/* Auto-Pay Toggle */}
              <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">Auto-Pay (Auto-Renew)</p>
                    <p className="text-xs text-muted-foreground">
                      {hasRecurringSub
                        ? `Recurring billing active — ${currencySymbol}${proFee}/month`
                        : `Automatically renew your Pro plan for ${currencySymbol}${proFee}/month`}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={autoRenewEnabled}
                  onCheckedChange={(val) => toggleAutoRenew.mutate(val)}
                  disabled={toggleAutoRenew.isPending || cancelAutoRenew.isPending}
                />
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Usage Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
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

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard className={!isPro ? 'ring-2 ring-primary/50' : ''}>
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-7 h-7 text-muted-foreground" />
                </div>
                <h2 className="font-display text-2xl font-bold">Free</h2>
                <p className="text-3xl font-bold mt-2">{currencySymbol}0</p>
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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
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
                  <span>Auto-renews monthly</span>
                </li>
              </ul>

              {isPro ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <div className="space-y-3">
                  {/* Recurring subscription buttons */}
                  <div className="space-y-2">
                    <p className="text-xs text-center text-muted-foreground font-medium">Subscribe with auto-pay</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        className="gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
                        onClick={() => handleSubscribeRecurring('razorpay')}
                        disabled={isSubscribing || !razorpayLoaded}
                      >
                        <CreditCard className="w-4 h-4 mr-1" />
                        {isIndian ? 'Razorpay' : 'Card/UPI'}
                      </Button>
                      {!isIndian && (
                        <Button
                          variant="outline"
                          className="border-primary/30 hover:bg-primary/10"
                          onClick={() => handleSubscribeRecurring('paypal')}
                          disabled={isSubscribing}
                        >
                          PayPal
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* One-time payment fallback */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/50" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card px-2 text-muted-foreground">or pay once</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleAddToCart}
                    disabled={isSubscribing}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    {proAlreadyInCart ? 'Go to Cart' : `One-time — ${currencySymbol}${proFee}`}
                  </Button>
                </div>
              )}
            </GlassCard>
          </motion.div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
