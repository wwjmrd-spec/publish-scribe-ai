import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Props {
  onSuccess?: () => void;
}

interface ArticleOption {
  id: string;
  title: string;
  reference_number: string;
  status: string | null;
}

export function AddManualPaymentDialog({ onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  const [form, setForm] = useState({
    authorEmail: '',
    amount: '',
    currency: 'USD' as 'INR' | 'USD' | 'USDT',
    paymentType: 'article_fee',
    gateway: 'manual' as 'manual' | 'razorpay' | 'paypal' | 'binance',
    transactionId: '',
    notes: '',
    selectedArticleId: '',
    paymentDate: new Date() as Date,
  });

  // Fetch articles when author email changes and payment type is article_fee
  useEffect(() => {
    const fetchArticles = async () => {
      if (!form.authorEmail.trim() || form.paymentType !== 'article_fee') {
        setArticles([]);
        return;
      }

      setLoadingArticles(true);
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', form.authorEmail.trim())
          .maybeSingle();

        if (!profile) {
          setArticles([]);
          return;
        }

        const { data } = await supabase
          .from('articles')
          .select('id, title, reference_number, status')
          .eq('author_id', profile.id)
          .order('created_at', { ascending: false });

        setArticles(data || []);
      } catch {
        setArticles([]);
      } finally {
        setLoadingArticles(false);
      }
    };

    const timer = setTimeout(fetchArticles, 500);
    return () => clearTimeout(timer);
  }, [form.authorEmail, form.paymentType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.authorEmail || !form.amount) {
      toast.error('Please fill in email and amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('email', form.authorEmail.trim())
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        toast.error('No author found with that email');
        setIsSubmitting(false);
        return;
      }

      const amount = parseFloat(form.amount);
      const articleIds = form.selectedArticleId ? [form.selectedArticleId] : [];
      const paymentItems = [
        {
          type: form.paymentType,
          manual: true,
          notes: form.notes || undefined,
          ...(form.selectedArticleId ? { articleId: form.selectedArticleId } : {}),
        },
      ];

      const { error } = await supabase.from('payments').insert({
        user_id: profile.id,
        article_ids: articleIds,
        amount,
        final_amount: amount,
        currency: form.currency,
        payment_gateway: form.gateway,
        payment_status: 'success',
        payment_items: paymentItems,
        transaction_id: form.transactionId || `MANUAL-${Date.now()}`,
        discount_code: form.paymentType === 'pro_subscription' ? 'PRO_SUBSCRIPTION' : null,
        created_at: form.paymentDate.toISOString(),
      });

      if (error) throw error;

      // If an article was selected, update its status to 'paid'
      if (form.selectedArticleId) {
        const { error: updateError } = await supabase
          .from('articles')
          .update({ status: 'paid' as any })
          .eq('id', form.selectedArticleId);

        if (updateError) {
          console.error('Failed to update article status:', updateError);
          toast.warning('Payment recorded but failed to update article status');
        } else if (form.paymentType === 'article_fee') {
          const formatResult = await supabase.functions.invoke('format-article', {
            body: { articleId: form.selectedArticleId },
          });
          if (formatResult.error || formatResult.data?.error) {
            toast.warning('Payment recorded. Formatting will retry automatically.');
          }
        }
      }

      toast.success('Payment recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-revenue-payments'] });
      setOpen(false);
      setForm({
        authorEmail: '', amount: '', currency: 'USD', paymentType: 'article_fee',
        gateway: 'manual', transactionId: '', notes: '', selectedArticleId: '', paymentDate: new Date(),
      });
      onSuccess?.();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to add payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="w-4 h-4" /> Add Manual Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Manual Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Author Email</Label>
            <Input
              type="email"
              placeholder="author@example.com"
              value={form.authorEmail}
              onChange={(e) => setForm(prev => ({ ...prev, authorEmail: e.target.value, selectedArticleId: '' }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="19.00"
                value={form.amount}
                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm(prev => ({ ...prev, currency: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR (₹)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment Type</Label>
            <Select value={form.paymentType} onValueChange={(v) => setForm(prev => ({ ...prev, paymentType: v, selectedArticleId: '' }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="article_fee">Article Fee</SelectItem>
                <SelectItem value="coauthor_certificate">Co-Author Certificate</SelectItem>
                <SelectItem value="pro_subscription">Pro Plan Subscription</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Article selector - shown when payment type is article_fee */}
          {form.paymentType === 'article_fee' && (
            <div className="space-y-2">
              <Label>Link to Article (optional)</Label>
              <Select
                value={form.selectedArticleId}
                onValueChange={(v) => setForm(prev => ({ ...prev, selectedArticleId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    loadingArticles ? 'Loading articles...' :
                    articles.length === 0 ? 'Enter author email first' :
                    'Select an article'
                  } />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No article linked</SelectItem>
                  {articles.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{a.reference_number} · {a.status?.replace(/_/g, ' ')}</span>
                        <span className="truncate max-w-[280px]">{a.title}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.selectedArticleId && form.selectedArticleId !== 'none' && (
                <p className="text-xs text-muted-foreground">
                  ✅ This article will be marked as <strong>paid</strong> upon recording.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Payment Gateway</Label>
            <Select value={form.gateway} onValueChange={(v) => setForm(prev => ({ ...prev, gateway: v as any }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual / Bank Transfer</SelectItem>
                <SelectItem value="razorpay">Razorpay</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="binance">Binance (USDT)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Payment Date */}
          <div className="space-y-2">
            <Label>Payment Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !form.paymentDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.paymentDate ? format(form.paymentDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.paymentDate}
                  onSelect={(d) => d && setForm(prev => ({ ...prev, paymentDate: d }))}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Transaction ID (optional)</Label>
            <Input
              placeholder="e.g. TXN-12345"
              value={form.transactionId}
              onChange={(e) => setForm(prev => ({ ...prev, transactionId: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              placeholder="e.g. Paid via bank transfer"
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Recording...' : 'Record Payment'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
