import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PaymentItem {
  type: 'article_fee' | 'pro_subscription' | 'coauthor_certificate' | 'fast_track_fee' | 'review_report';
  articleId?: string;
  coAuthorId?: string;
}

export interface PaymentData {
  items: PaymentItem[];
  amount: number;
  currency: 'INR' | 'USD' | 'USDT';
  discountCode?: string;
  discountAmount?: number;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export type PaymentGateway = 'razorpay' | 'paypal' | 'binance';

export interface BinanceOrderResult {
  paymentId: string;
  walletAddress: string;
  amount: number;
  currency: string;
  network: string;
}

export function usePayment() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [binanceOrder, setBinanceOrder] = useState<BinanceOrderResult | null>(null);
  const { toast } = useToast();

  const createRazorpayOrder = async (paymentData: PaymentData) => {
    const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
      body: paymentData,
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    return data;
  };

  const createPayPalOrder = async (paymentData: PaymentData, returnUrl?: string) => {
    const { data, error } = await supabase.functions.invoke('create-paypal-order', {
      body: {
        ...paymentData,
        returnUrl: returnUrl || window.location.origin + '/author/cart',
      },
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    return data;
  };

  const verifyPayment = async (verificationData: {
    gateway: PaymentGateway;
    paymentId: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    paypalOrderId?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke('verify-payment', {
      body: verificationData,
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    return data;
  };

  const processRazorpayPayment = async (
    paymentData: PaymentData,
    userEmail: string,
    userName: string,
    onSuccess: () => void
  ) => {
    if (!window.Razorpay) {
      throw new Error('Razorpay SDK not loaded');
    }

    setIsProcessing(true);

    try {
      const orderData = await createRazorpayOrder(paymentData);

      const articleCount = paymentData.items.filter(i => i.type === 'article_fee').length;
      const hasSubscription = paymentData.items.some(i => i.type === 'pro_subscription');
      const certCount = paymentData.items.filter(i => i.type === 'coauthor_certificate').length;

      const descParts: string[] = [];
      if (articleCount > 0) descParts.push(`${articleCount} article(s)`);
      if (hasSubscription) descParts.push('Pro Plan');
      if (certCount > 0) descParts.push(`${certCount} certificate(s)`);

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'WWJMRD',
        description: `Payment for ${descParts.join(', ')}`,
        order_id: orderData.orderId,
        prefill: { email: userEmail, name: userName },
        theme: { color: '#00d4ff' },
        handler: async (response: RazorpayResponse) => {
          try {
            await verifyPayment({
              gateway: 'razorpay',
              paymentId: orderData.paymentId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            toast({ title: 'Payment successful!', description: 'Your payment has been processed successfully.' });
            onSuccess();
          } catch (error) {
            console.error('Verification failed:', error);
            toast({ title: 'Payment verification failed', description: 'Please contact support if amount was deducted.', variant: 'destructive' });
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
            toast({ title: 'Payment cancelled', description: 'You can try again when ready.' });
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error('Razorpay error:', error);
      setIsProcessing(false);
      throw error;
    }
  };

  const processPayPalPayment = async (
    paymentData: PaymentData,
    onRedirect: (paymentId: string) => void,
    returnUrl?: string
  ) => {
    setIsProcessing(true);
    try {
      const orderData = await createPayPalOrder(paymentData, returnUrl);
      if (!orderData.approvalUrl) throw new Error('PayPal approval URL not received');
      localStorage.setItem('wwjmrd-paypal-payment-id', orderData.paymentId);
      localStorage.setItem('wwjmrd-paypal-order-id', orderData.orderId);
      onRedirect(orderData.paymentId);
      window.location.href = orderData.approvalUrl;
    } catch (error) {
      console.error('PayPal error:', error);
      setIsProcessing(false);
      throw error;
    }
  };

  const capturePayPalPayment = async (onSuccess: () => void) => {
    const paymentId = localStorage.getItem('wwjmrd-paypal-payment-id');
    const paypalOrderId = localStorage.getItem('wwjmrd-paypal-order-id');
    if (!paymentId || !paypalOrderId) throw new Error('PayPal payment data not found');

    setIsProcessing(true);
    try {
      await verifyPayment({ gateway: 'paypal', paymentId, paypalOrderId });
      localStorage.removeItem('wwjmrd-paypal-payment-id');
      localStorage.removeItem('wwjmrd-paypal-order-id');
      toast({ title: 'Payment successful!', description: 'Your PayPal payment has been processed successfully.' });
      onSuccess();
    } catch (error) {
      console.error('PayPal capture failed:', error);
      toast({ title: 'Payment verification failed', description: 'Please contact support if amount was deducted.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const processBinancePayment = async (paymentData: PaymentData): Promise<BinanceOrderResult> => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-binance-order', {
        body: paymentData,
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const result: BinanceOrderResult = {
        paymentId: data.paymentId,
        walletAddress: data.walletAddress,
        amount: data.amount,
        currency: data.currency,
        network: data.network,
      };

      setBinanceOrder(result);
      setIsProcessing(false);
      return result;
    } catch (error) {
      console.error('Binance error:', error);
      setIsProcessing(false);
      throw error;
    }
  };

  const submitBinanceTxHash = async (paymentId: string, transactionHash: string) => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-binance-payment', {
        body: { paymentId, transactionHash, action: 'submit_tx_hash' },
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      toast({ title: 'Transaction submitted!', description: 'Your USDT payment is being reviewed. You will be notified once verified.' });
      setBinanceOrder(null);
      return data;
    } catch (error) {
      console.error('Submit tx hash error:', error);
      toast({ title: 'Submission failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const clearBinanceOrder = () => setBinanceOrder(null);

  return {
    isProcessing,
    binanceOrder,
    processRazorpayPayment,
    processPayPalPayment,
    capturePayPalPayment,
    processBinancePayment,
    submitBinanceTxHash,
    clearBinanceOrder,
  };
}
