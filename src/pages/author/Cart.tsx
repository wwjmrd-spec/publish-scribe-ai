import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ShoppingCart,
  FileText,
  Tag,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Trash2,
} from 'lucide-react';

export default function Cart() {
  const { user, isIndian } = useAuth();
  const { toast } = useToast();

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

  const feePerArticle = useMemo(() => {
    if (!fees) return isIndian ? 2500 : 79;
    return isIndian ? Number(fees.indian_fee) : Number(fees.international_fee);
  }, [fees, isIndian]);

  const subtotal = useMemo(() => {
    return selectedArticles.length * feePerArticle;
  }, [selectedArticles.length, feePerArticle]);

  const discountAmount = useMemo(() => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.type === 'percentage') {
      return (subtotal * appliedDiscount.value) / 100;
    }
    return Math.min(appliedDiscount.value, subtotal);
  }, [appliedDiscount, subtotal]);

  const total = subtotal - discountAmount;

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
    if (!discountCode.trim()) return;
    
    setApplyingDiscount(true);
    try {
      const { data, error } = await supabase
        .from('discount_codes')
        .select('*')
        .eq('code', discountCode.toUpperCase())
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

      // Check validity dates
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

      // Check currency compatibility
      if (data.currency !== 'BOTH' && data.currency !== currency) {
        toast({
          title: 'Invalid currency',
          description: `This code is only valid for ${data.currency} payments`,
          variant: 'destructive',
        });
        setAppliedDiscount(null);
        return;
      }

      // Check usage limit
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
    if (selectedArticles.length === 0) {
      toast({
        title: 'No articles selected',
        description: 'Please select at least one article to pay for',
        variant: 'destructive',
      });
      return;
    }

    // TODO: Implement Razorpay/PayPal payment
    toast({
      title: 'Payment integration coming soon',
      description: 'Payment gateway integration is in development',
    });
  };

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
            Select articles to pay publication fees
          </p>
        </div>

        {pendingArticles?.length === 0 ? (
          <GlassCard className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center mx-auto mb-6">
              <ShoppingCart className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              Cart is empty
            </h3>
            <p className="text-muted-foreground">
              No articles are pending payment at the moment
            </p>
          </GlassCard>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Articles List */}
            <div className="lg:col-span-2 space-y-4">
              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-xl font-semibold">
                    Pending Articles ({pendingArticles?.length})
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                  >
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
            </div>

            {/* Payment Summary */}
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
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                        <Tag className="w-4 h-4 text-green-500" />
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
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Articles ({selectedArticles.length})
                      </span>
                      <span>
                        {currencySymbol}{subtotal.toLocaleString()}
                      </span>
                    </div>

                    {appliedDiscount && (
                      <div className="flex justify-between text-sm text-green-500">
                        <span>Discount</span>
                        <span>-{currencySymbol}{discountAmount.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-lg font-bold pt-3 border-t border-[hsl(var(--glass-border))]">
                      <span>Total</span>
                      <span className="gradient-text">
                        {currencySymbol}{total.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Payment Button */}
                  <Button
                    className="w-full gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
                    size="lg"
                    disabled={selectedArticles.length === 0}
                    onClick={handlePayment}
                  >
                    <CreditCard className="w-5 h-5 mr-2" />
                    Pay with {isIndian ? 'Razorpay' : 'PayPal'}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Secure payment powered by {isIndian ? 'Razorpay' : 'PayPal'}
                  </p>
                </div>
              </GlassCard>

              {/* Payment Info */}
              <GlassCard className="text-sm">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">Payment Information</p>
                    <p className="text-muted-foreground">
                      Publication fee per article: {currencySymbol}
                      {feePerArticle.toLocaleString()}
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
