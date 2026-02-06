import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PaymentItem {
  type: 'article_fee' | 'pro_subscription' | 'coauthor_certificate';
  articleId?: string;
  coAuthorId?: string;
}

export interface PaymentData {
  items: PaymentItem[];
  amount: number;
  currency: 'INR' | 'USD';
  discountCode?: string;
  discountAmount?: number;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export function usePayment() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const createRazorpayOrder = async (paymentData: PaymentData) => {
    const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
      body: paymentData,
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    return data;
  };

  const verifyPayment = async (verificationData: {
    gateway: 'razorpay';
    paymentId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
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

      const itemCount = paymentData.items.length;
      const hasSubscription = paymentData.items.some(i => i.type === 'pro_subscription');
      const articleCount = paymentData.items.filter(i => i.type === 'article_fee').length;
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
        prefill: {
          email: userEmail,
          name: userName,
        },
        theme: {
          color: '#00d4ff',
        },
        handler: async (response: RazorpayResponse) => {
          try {
            await verifyPayment({
              gateway: 'razorpay',
              paymentId: orderData.paymentId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            toast({
              title: 'Payment successful!',
              description: 'Your payment has been processed successfully.',
            });
            onSuccess();
          } catch (error) {
            console.error('Verification failed:', error);
            toast({
              title: 'Payment verification failed',
              description: 'Please contact support if amount was deducted.',
              variant: 'destructive',
            });
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
            toast({
              title: 'Payment cancelled',
              description: 'You can try again when ready.',
            });
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

  return {
    isProcessing,
    processRazorpayPayment,
  };
}
