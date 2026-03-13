import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  onSuccess?: () => void;
}

export function AddManualPaymentDialog({ onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    authorEmail: '',
    amount: '',
    currency: 'USD' as 'INR' | 'USD' | 'USDT',
    paymentType: 'article_fee',
    gateway: 'manual' as 'manual' | 'razorpay' | 'paypal' | 'binance',
    transactionId: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.authorEmail || !form.amount) {
      toast.error('Please fill in email and amount');
      return;
    }

    setIsSubmitting(true);
    try {
      // Find the author by email
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
      const paymentItems = [{ type: form.paymentType, manual: true, notes: form.notes || undefined }];

      const { error } = await supabase.from('payments').insert({
        user_id: profile.id,
        article_ids: [],
        amount,
        final_amount: amount,
        currency: form.currency,
        payment_gateway: form.gateway,
        payment_status: 'success',
        payment_items: paymentItems,
        transaction_id: form.transactionId || `MANUAL-${Date.now()}`,
        discount_code: form.paymentType === 'pro_subscription' ? 'PRO_SUBSCRIPTION' : null,
      });

      if (error) throw error;

      toast.success('Payment recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-revenue-payments'] });
      setOpen(false);
      setForm({ authorEmail: '', amount: '', currency: 'USD', paymentType: 'article_fee', gateway: 'manual', transactionId: '', notes: '' });
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
      <DialogContent className="sm:max-w-md">
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
              onChange={(e) => setForm(prev => ({ ...prev, authorEmail: e.target.value }))}
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
            <Select value={form.paymentType} onValueChange={(v) => setForm(prev => ({ ...prev, paymentType: v }))}>
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
