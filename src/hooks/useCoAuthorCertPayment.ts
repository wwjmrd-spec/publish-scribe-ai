import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { incrementUsage } from '@/hooks/useSubscription';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export function useCoAuthorCertPayment() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingCoAuthorId, setProcessingCoAuthorId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const payForCoAuthorCertificate = async (
    coAuthorId: string,
    articleId: string,
    amount: number,
    currency: 'INR' | 'USD',
    userEmail: string,
    userName: string
  ) => {
    if (!window.Razorpay) {
      toast.error('Payment gateway not loaded. Please refresh and try again.');
      return;
    }

    setIsProcessing(true);
    setProcessingCoAuthorId(coAuthorId);

    try {
      const { data: orderData, error: orderError } = await supabase.functions.invoke(
        'create-coauthor-cert-order',
        {
          body: { coAuthorId, articleId, amount, currency },
        }
      );

      if (orderError) throw new Error(orderError.message);
      if (orderData?.error) throw new Error(orderData.error);

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'WWJMRD',
        description: 'Co-Author Certificate',
        order_id: orderData.orderId,
        prefill: {
          email: userEmail,
          name: userName,
        },
        theme: { color: '#00d4ff' },
        handler: async (response: RazorpayResponse) => {
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
              'verify-coauthor-cert-payment',
              {
                body: {
                  certRecordId: orderData.certRecordId,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                },
              }
            );

            if (verifyError) throw new Error(verifyError.message);
            if (verifyData?.error) throw new Error(verifyData.error);

            // Increment usage
            if (user?.id) {
              await incrementUsage(user.id, 'coauthor_certs_used');
            }

            toast.success('Co-author certificate generated successfully!');
            queryClient.invalidateQueries({ queryKey: ['published-articles'] });
          } catch (error: any) {
            console.error('Verification failed:', error);
            toast.error('Payment verification failed. Please contact support.');
          } finally {
            setIsProcessing(false);
            setProcessingCoAuthorId(null);
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
            setProcessingCoAuthorId(null);
            toast.info('Payment cancelled');
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error: any) {
      console.error('Co-author cert payment error:', error);
      setIsProcessing(false);
      setProcessingCoAuthorId(null);
      toast.error(error.message || 'Failed to initiate payment');
    }
  };

  return {
    isProcessing,
    processingCoAuthorId,
    payForCoAuthorCertificate,
  };
}
