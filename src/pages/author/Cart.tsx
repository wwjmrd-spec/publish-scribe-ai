import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useToast } from '@/hooks/use-toast';
import { useRazorpay } from '@/hooks/useRazorpay';
import { usePayment, PaymentGateway } from '@/hooks/usePayment';
import { useSubscription } from '@/hooks/useSubscription';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams } from 'react-router-dom';
import {
  ShoppingCart,
  FileText,
  Tag,
  AlertCircle,
  CreditCard,
  Trash2,
  Loader2,
  Crown,
  Users,
} from 'lucide-react';

export default function Cart() {
  const { user, isIndian } = useAuth();
  const { items: cartItems, removeItem, clearCart } = useCart();
  const { subscription } = useSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const { isLoaded: razorpayLoaded } = useRazorpay();
  const { isProcessing, processRazorpayPayment, processPayPalPayment, capturePayPalPayment } = usePayment();
  const [paymentMethod, setPaymentMethod] = useState<PaymentGateway>('razorpay');

  const [selectedArticles, setSelectedArticles] = useState<string[]>([]);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    value: number;
    type: 'percentage' | 'fixed';
  } | null>(null);
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  const currency = isIndian ? 'INR' : 'USD';
  const currencySymbol = isIndian ? '₹' : '$';

  const { data: pendingArticles, isLoading: articlesLoading } = useQuery({
    queryKey: ['pending-articles', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('author_id', user?.id)
        .eq('status', 'pending_fee')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

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

  // Handle PayPal return
  useEffect(() => {
    const paypalStatus = searchParams.get('paypal');
    if (paypalStatus === 'success') {
      setSearchParams({}, { replace: true });
      capturePayPalPayment(() => {
        queryClient.invalidateQueries({ queryKey: ['pending-articles'] });
        queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
        queryClient.invalidateQueries({ queryKey: ['published-articles'] });
        queryClient.invalidateQueries({ queryKey: ['plan-usage'] });
        setSelectedArticles([]);
        setAppliedDiscount(null);
        setDiscountCode('');
        clearCart();
      });
    } else if (paypalStatus === 'cancelled') {
      setSearchParams({}, { replace: true });
      toast({
        title: 'Payment cancelled',
        description: 'You cancelled the PayPal payment. You can try again when ready.',
      });
    }
  }, []);

  const feePerArticle = useMemo(() => {
    if (!fees) return isIndian ? 2500 : 79;
    return isIndian ? Number(fees.indian_fee) : Number(fees.international_fee);
  }, [fees, isIndian]);

  // Filter out invalid cart items (e.g., Pro subscription when already Pro)
  const validCartItems = useMemo(() => {
    return cartItems.filter(item => {
      if (item.type === 'pro_subscription' && subscription.plan === 'pro') return false;
      return true;
    });
  }, [cartItems, subscription.plan]);

  const articleSubtotal = useMemo(() => {
    return selectedArticles.length * feePerArticle;
  }, [selectedArticles.length, feePerArticle]);

  const cartItemsSubtotal = useMemo(() => {
    return validCartItems.reduce((sum, item) => sum + item.amount, 0);
  }, [validCartItems]);

  const subtotal = articleSubtotal + cartItemsSubtotal;

  const discountAmountValue = useMemo(() => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.type === 'percentage') {
      return (subtotal * appliedDiscount.value) / 100;
    }
    return Math.min(appliedDiscount.value, subtotal);
  }, [appliedDiscount, subtotal]);

  const total = subtotal - discountAmountValue;

  const totalItemCount = selectedArticles.length + validCartItems.length;

  const toggleArticle = (articleId: string) => {
    setSelectedArticles((prev) =>
      prev.includes(articleId)
        ? prev.filter((id) => id !== articleId)
        : [...prev, articleId]
    );
  };

  const selectAll = () => {
    if (pendingArticles) {
      if (selectedArticles.length === pendingArticles.length) {
        setSelectedArticles([]);
      } else {
        setSelectedArticles(pendingArticles.map((a) => a.id));
      }
    }
  };

  const applyDiscountCode = async () => {
    const trimmedCode = discountCode.trim().toUpperCase();

    const DISCOUNT_CODE_REGEX = /^[A-Z0-9]{4,20}$/;
    if (!trimmedCode || !DISCOUNT_CODE_REGEX.test(trimmedCode)) {
      toast({
        title: 'Invalid format',
        description: 'Discount code must be 4-20 alphanumeric characters',
        variant: 'destructive',
      });
      return;
    }

    setApplyingDiscount(true);
    try {
      const { data, error } = await supabase
        .from('discount_codes')
        .select('*')
        .eq('code', trimmedCode)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        toast({
          title: 'Invalid discount code',
          description: 'The code you entered is invalid or expired',
          variant: 'destructive',
        });
        setAppliedDiscount(null);
        return;
      }

      const now = new Date();
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);

      if (now < startDate || now > endDate) {
        toast({
          title: 'Discount code expired',
          description: 'This code is no longer valid',
          variant: 'destructive',
        });
        setAppliedDiscount(null);
        return;
      }

      if (data.currency !== 'BOTH' && data.currency !== currency) {
        toast({
          title: 'Invalid currency',
          description: `This code is only valid for ${data.currency} payments`,
          variant: 'destructive',
        });
        setAppliedDiscount(null);
        return;
      }

      if (data.usage_limit && data.used_count >= data.usage_limit) {
        toast({
          title: 'Discount limit reached',
          description: 'This code has reached its usage limit',
          variant: 'destructive',
        });
        setAppliedDiscount(null);
        return;
      }

      setAppliedDiscount({
        code: data.code,
        value: Number(data.discount_value),
        type: data.discount_type as 'percentage' | 'fixed',
      });

      toast({
        title: 'Discount applied!',
        description: `${data.discount_type === 'percentage' ? data.discount_value + '%' : currencySymbol + data.discount_value} discount applied`,
      });
    } catch (error) {
      console.error('Discount error:', error);
      toast({
        title: 'Error applying discount',
        variant: 'destructive',
      });
    } finally {
      setApplyingDiscount(false);
    }
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
  };

  const handlePayment = async () => {
    if (totalItemCount === 0) {
      toast({
        title: 'No items selected',
        description: 'Please select at least one item to pay for',
        variant: 'destructive',
      });
      return;
    }

    if (paymentMethod === 'razorpay' && !razorpayLoaded) {
      toast({
        title: 'Loading payment gateway',
        description: 'Please wait a moment and try again.',
      });
      return;
    }

    const items = [
      ...selectedArticles.map(id => ({ type: 'article_fee' as const, articleId: id })),
      ...validCartItems.map(item => ({
        type: item.type as 'pro_subscription' | 'coauthor_certificate',
        articleId: item.articleId,
        coAuthorId: item.coAuthorId,
      })),
    ];

    const paymentData = {
      items,
      amount: subtotal,
      currency: currency as 'INR' | 'USD',
      discountCode: appliedDiscount?.code,
      discountAmount: discountAmountValue,
    };

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: ['pending-articles'] });
      queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['published-articles'] });
      queryClient.invalidateQueries({ queryKey: ['plan-usage'] });
      setSelectedArticles([]);
      setAppliedDiscount(null);
      setDiscountCode('');
      clearCart();
    };

    try {
      if (paymentMethod === 'razorpay') {
        await processRazorpayPayment(
          paymentData,
          user?.email || '',
          user?.user_metadata?.full_name || user?.email || '',
          onSuccess
        );
      } else {
        await processPayPalPayment(paymentData, () => {
          // PayPal redirects away, nothing to do here
        });
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const hasArticles = (pendingArticles?.length ?? 0) > 0;
  const hasCartItems = validCartItems.length > 0;
  const isEmpty = !hasArticles && !hasCartItems;

  if (articlesLoading) {
    return (
      <DashboardLayout type="author">
        <div className="flex items-center justify-center h-64">
          <GlassSpinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="author">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Payment Cart</h1>
          <p className="text-muted-foreground">
            Review and pay for all your items in one go
          </p>
        </div>

        {isEmpty ? (
          <GlassCard className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center mx-auto mb-6">
              <ShoppingCart className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              Cart is empty
            </h3>
            <p className="text-muted-foreground">
              No items are pending payment at the moment
            </p>
          </GlassCard>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Items List */}
            <div className="lg:col-span-2 space-y-4">
              {/* Pending Articles */}
              {hasArticles && (
                <GlassCard>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      <h2 className="font-display text-xl font-semibold">
                        Article Publication Fees ({pendingArticles?.length})
                      </h2>
                    </div>
                    <Button variant="ghost" size="sm" onClick={selectAll}>
                      {selectedArticles.length === pendingArticles?.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {pendingArticles?.map((article) => (
                      <div
                        key={article.id}
                        className={`flex items-center gap-4 p-4 rounded-lg transition-all duration-300 cursor-pointer ${
                          selectedArticles.includes(article.id)
                            ? 'bg-primary/10 border border-primary/30'
                            : 'bg-[hsl(var(--glass-bg))] hover:bg-[hsl(var(--glass-bg-strong))] border border-transparent'
                        }`}
                        onClick={() => toggleArticle(article.id)}
                      >
                        <Checkbox
                          checked={selectedArticles.includes(article.id)}
                          onCheckedChange={() => toggleArticle(article.id)}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <div className="w-10 h-10 rounded-lg bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{article.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {article.reference_number}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {currencySymbol}{feePerArticle.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              {/* Cart Items (Pro Subscription, Co-Author Certs) */}
              {hasCartItems && (
                <GlassCard>
                  <div className="flex items-center gap-2 mb-4">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    <h2 className="font-display text-xl font-semibold">
                      Other Items ({validCartItems.length})
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {validCartItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-4 p-4 rounded-lg bg-[hsl(var(--glass-bg))] border border-transparent"
                      >
                        <div className="w-10 h-10 rounded-lg bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center flex-shrink-0">
                          {item.type === 'pro_subscription' ? (
                            <Crown className="w-5 h-5 text-primary" />
                          ) : (
                            <Users className="w-5 h-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.label}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {item.description}
                          </p>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <p className="font-semibold">
                            {currencySymbol}{item.amount.toLocaleString()}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </div>

            {/* Order Summary */}
            <div className="space-y-4">
              <GlassCard>
                <h2 className="font-display text-xl font-semibold mb-4">
                  Order Summary
                </h2>

                <div className="space-y-4">
                  {/* Discount Code */}
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Discount Code
                    </label>
                    {appliedDiscount ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <Tag className="w-4 h-4 text-emerald-500" />
                        <span className="flex-1 font-mono font-medium">
                          {appliedDiscount.code}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={removeDiscount}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                          placeholder="Enter code"
                          className="glass-input uppercase"
                        />
                        <Button
                          variant="outline"
                          onClick={applyDiscountCode}
                          disabled={applyingDiscount || !discountCode.trim()}
                        >
                          {applyingDiscount ? (
                            <GlassSpinner size="sm" />
                          ) : (
                            'Apply'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Summary */}
                  <div className="pt-4 border-t border-[hsl(var(--glass-border))] space-y-3">
                    {selectedArticles.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Articles ({selectedArticles.length})
                        </span>
                        <span>
                          {currencySymbol}{articleSubtotal.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {validCartItems.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground truncate mr-2">
                          {item.type === 'pro_subscription' ? 'Pro Plan' : item.label}
                        </span>
                        <span className="flex-shrink-0">
                          {currencySymbol}{item.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}

                    {appliedDiscount && (
                      <div className="flex justify-between text-sm text-emerald-500">
                        <span>Discount</span>
                        <span>-{currencySymbol}{discountAmountValue.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-lg font-bold pt-3 border-t border-[hsl(var(--glass-border))]">
                      <span>Total</span>
                      <span className="gradient-text">
                        {currencySymbol}{total.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Payment Method Selection */}
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Payment Method
                    </label>
                    <div className={`grid ${isIndian ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
                      <button
                        type="button"
                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all duration-200 ${
                          paymentMethod === 'razorpay'
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] text-muted-foreground hover:bg-[hsl(var(--glass-bg-strong))]'
                        }`}
                        onClick={() => setPaymentMethod('razorpay')}
                      >
                        <CreditCard className="w-4 h-4" />
                        Razorpay
                      </button>
                      {!isIndian && (
                        <button
                          type="button"
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all duration-200 ${
                            paymentMethod === 'paypal'
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] text-muted-foreground hover:bg-[hsl(var(--glass-bg-strong))]'
                          }`}
                          onClick={() => setPaymentMethod('paypal')}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/>
                          </svg>
                          PayPal
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payment Button */}
                  <Button
                    className="w-full gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
                    size="lg"
                    disabled={totalItemCount === 0 || isProcessing}
                    onClick={handlePayment}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5 mr-2" />
                        {paymentMethod === 'razorpay' ? 'Pay with Razorpay' : 'Pay with PayPal'}
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Secure payment via {paymentMethod === 'razorpay' ? 'Razorpay' : 'PayPal'}
                  </p>
                </div>
              </GlassCard>

              {/* Payment Info */}
              <GlassCard className="text-sm">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Payment Information</p>
                    <p className="text-muted-foreground">
                      Publication fee per article: {currencySymbol}
                      {feePerArticle.toLocaleString()}
                    </p>
                    <p className="text-muted-foreground">
                      All items will be processed in a single payment.
                    </p>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
