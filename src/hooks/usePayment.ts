import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PaymentData {
  articleIds: string[];
  amount: number;
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

  const createPayPalOrder = async (paymentData: PaymentData) => {
    const { data, error } = await supabase.functions.invoke('create-paypal-order', {
      body: paymentData,
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    return data;
  };

  const verifyPayment = async (verificationData: {
    gateway: 'razorpay' | 'paypal';
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

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Academic Journal',
        description: `Publication fee for ${paymentData.articleIds.length} article(s)`,
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
              description: 'Your article fees have been paid successfully.',
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

  const processPayPalPayment = async (
    paymentData: PaymentData,
    onSuccess: () => void
  ) => {
    setIsProcessing(true);

    try {
      const orderData = await createPayPalOrder(paymentData);

      // Store payment info for verification after redirect
      sessionStorage.setItem('paypal_payment', JSON.stringify({
        paymentId: orderData.paymentId,
        orderId: orderData.orderId,
      }));

      // Redirect to PayPal
      window.location.href = orderData.approvalUrl;
    } catch (error) {
      console.error('PayPal error:', error);
      setIsProcessing(false);
      throw error;
    }
  };

  const handlePayPalReturn = async (orderId: string, onSuccess: () => void) => {
    setIsProcessing(true);

    try {
      const storedPayment = sessionStorage.getItem('paypal_payment');
      if (!storedPayment) {
        throw new Error('Payment session not found');
      }

      const { paymentId } = JSON.parse(storedPayment);

      await verifyPayment({
        gateway: 'paypal',
        paymentId,
        paypalOrderId: orderId,
      });

      sessionStorage.removeItem('paypal_payment');

      toast({
        title: 'Payment successful!',
        description: 'Your article fees have been paid successfully.',
      });
      onSuccess();
    } catch (error) {
      console.error('PayPal verification failed:', error);
      toast({
        title: 'Payment verification failed',
        description: 'Please contact support if amount was deducted.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    processRazorpayPayment,
    processPayPalPayment,
    handlePayPalReturn,
  };
}
