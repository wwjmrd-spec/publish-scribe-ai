import React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCart, CartItem } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CreditCard, ShoppingCart, Wallet } from 'lucide-react';

export type PayMethod = 'razorpay' | 'paypal' | 'cart';

interface PayItem {
  type: 'review_report' | 'article_edit' | 'coauthor_certificate' | 'article_fee' | 'pro_subscription';
  articleId?: string;
  coAuthorId?: string;
}

interface PayOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  items: PayItem[];
  inrAmount: number;
  usdAmount: number;
  cartItem: CartItem;
  /** Called after a successful (verified) payment. */
  onPaid?: () => void;
  /** Optional extra button (e.g. Upgrade to Pro). */
  extraAction?: React.ReactNode;
  description2?: string;
}

const methods: { id: PayMethod; label: string; hint: string; icon: React.ElementType }[] = [
  { id: 'razorpay', label: 'Razorpay', hint: 'Cards, UPI, Netbanking', icon: CreditCard },
  { id: 'paypal', label: 'PayPal', hint: 'International cards', icon: Wallet },
  { id: 'cart', label: 'Add to Cart', hint: 'Pay later — also enables USDT / discount codes', icon: ShoppingCart },
];

export function PayOptionsDialog({
  open, onOpenChange, title, description, items, inrAmount, usdAmount, cartItem, onPaid, extraAction,
}: PayOptionsDialogProps) {
  const { user, isIndian } = useAuth();
  const navigate = useNavigate();
  const { addItem, hasItem } = useCart();
  const [method, setMethod] = React.useState<PayMethod | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setMethod(null);
  }, [open]);

  // PayPal is not offered to Indian authors; everyone else may use either gateway.
  const availableMethods = React.useMemo(
    () => methods.filter((m) => !(isIndian && m.id === 'paypal')),
    [isIndian],
  );

  // Currency follows the author's location, not the gateway.
  const currency: 'INR' | 'USD' = isIndian ? 'INR' : 'USD';
  const amount = isIndian ? inrAmount : usdAmount;
  const priceLabel = isIndian ? `₹${inrAmount}` : `$${usdAmount}`;

  const goToCart = () => {
    if (!hasItem(cartItem.id)) addItem(cartItem);
    onOpenChange(false);
    navigate('/author/cart');
  };

  const pay = async () => {
    if (!user || !method) return;
    if (method === 'cart') return goToCart();

    setBusy(true);
    try {
      if (method === 'razorpay') {
        if (!(window as any).Razorpay) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://checkout.razorpay.com/v1/checkout.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Razorpay SDK failed to load'));
            document.body.appendChild(s);
          });
        }
        const orderRes = await supabase.functions.invoke('create-razorpay-order', {
          body: { items, amount, currency },
        });
        if (orderRes.error || (orderRes.data as any)?.error) {
          throw new Error(orderRes.error?.message || (orderRes.data as any)?.error || 'Order failed');
        }
        const orderData: any = orderRes.data;
        const rzp = new (window as any).Razorpay({
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: 'WWJMRD',
          description: cartItem.label,
          order_id: orderData.orderId,
          prefill: { email: user.email, name: user.user_metadata?.full_name || '' },
          theme: { color: '#00d4ff' },
          handler: async (resp: any) => {
            try {
              const v = await supabase.functions.invoke('verify-payment', {
                body: {
                  gateway: 'razorpay',
                  paymentId: orderData.paymentId,
                  razorpayOrderId: resp.razorpay_order_id,
                  razorpayPaymentId: resp.razorpay_payment_id,
                  razorpaySignature: resp.razorpay_signature,
                },
              });
              if (v.error || (v.data as any)?.error) throw new Error(v.error?.message || (v.data as any)?.error);
              toast.success('Payment successful!');
              onOpenChange(false);
              onPaid?.();
            } catch (e: any) {
              toast.error('Payment verification failed: ' + (e.message || 'unknown'));
            } finally {
              setBusy(false);
            }
          },
          modal: { ondismiss: () => setBusy(false) },
        });
        rzp.open();
      } else {
        const orderRes = await supabase.functions.invoke('create-paypal-order', {
          body: { items, amount, currency: 'USD', returnUrl: window.location.href },
        });
        if (orderRes.error || (orderRes.data as any)?.error) {
          throw new Error(orderRes.error?.message || (orderRes.data as any)?.error || 'Order failed');
        }
        const d: any = orderRes.data;
        localStorage.setItem('wwjmrd-paypal-payment-id', d.paymentId);
        localStorage.setItem('wwjmrd-paypal-order-id', d.orderId);
        window.location.href = d.approvalUrl;
      }
    } catch (e: any) {
      toast.error('Failed to start payment: ' + (e.message || 'unknown'));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild><div className="text-sm">{description}</div></DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">Choose how you want to pay</p>
          {availableMethods.map((m) => {
            const Icon = m.icon;
            const active = method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] hover:bg-[hsl(var(--glass-bg-strong))]'
                }`}
              >
                <Icon className="w-5 h-5 text-primary shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.hint}</span>
                </span>
                {active && m.id !== 'cart' && (
                  <span className="text-sm font-semibold">{priceLabel}</span>
                )}
              </button>
            );
          })}
          {method && method !== 'cart' && (
            <p className="text-xs text-muted-foreground">
              Amount payable: <span className="font-semibold text-foreground">{priceLabel}</span> ({currency})
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {extraAction}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button className="gradient-primary" onClick={pay} disabled={busy || !method}>
            {busy ? <><GlassSpinner size="sm" className="mr-2" />Processing…</>
              : method === 'cart' ? <><ShoppingCart className="w-4 h-4 mr-1" />Add to Cart</>
              : !method ? 'Select a payment method'
              : `Pay ${priceLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
