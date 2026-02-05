import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const body = `${orderId}|${paymentId}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return expectedSignature === signature;
}

async function capturePayPalOrder(orderId: string, accessToken: string): Promise<any> {
  const response = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('PayPal capture failed:', errorData);
    throw new Error('Failed to capture payment');
  }

  return response.json();
}

async function getPayPalAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const auth = btoa(`${clientId}:${clientSecret}`);
  
  const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to get PayPal access token');
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      throw new Error('Unauthorized');
    }

    const { gateway, paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature, paypalOrderId } = await req.json();

    console.log('Verifying payment:', { gateway, paymentId });

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get payment record
    const { data: payment, error: paymentFetchError } = await serviceClient
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .single();

    if (paymentFetchError || !payment) {
      console.error('Payment not found:', paymentFetchError);
      throw new Error('Payment not found');
    }

    if (payment.payment_status === 'success') {
      return new Response(
        JSON.stringify({ success: true, message: 'Payment already verified' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let verified = false;
    let transactionDetails = '';

    if (gateway === 'razorpay') {
      const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
      if (!RAZORPAY_KEY_SECRET) {
        throw new Error('Payment gateway not configured');
      }

      verified = await verifyRazorpaySignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        RAZORPAY_KEY_SECRET
      );
      transactionDetails = razorpayPaymentId;
      console.log('Razorpay signature verification:', verified);
    } else if (gateway === 'paypal') {
      const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
      const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');
      
      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        throw new Error('Payment gateway not configured');
      }

      const accessToken = await getPayPalAccessToken(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
      const captureResult = await capturePayPalOrder(paypalOrderId, accessToken);
      
      verified = captureResult.status === 'COMPLETED';
      transactionDetails = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id || paypalOrderId;
      console.log('PayPal capture result:', captureResult.status);
    } else {
      throw new Error('Invalid payment gateway');
    }

    if (!verified) {
      // Update payment as failed
      await serviceClient
        .from('payments')
        .update({ payment_status: 'failed' })
        .eq('id', paymentId);

      throw new Error('Payment verification failed');
    }

    // Update payment as successful
    const { error: updatePaymentError } = await serviceClient
      .from('payments')
      .update({ 
        payment_status: 'success',
        transaction_id: transactionDetails,
      })
      .eq('id', paymentId);

    if (updatePaymentError) {
      console.error('Failed to update payment:', updatePaymentError);
      throw new Error('Failed to update payment status');
    }

    // Update article statuses to 'paid'
    const { error: updateArticlesError } = await serviceClient
      .from('articles')
      .update({ status: 'paid' })
      .in('id', payment.article_ids);

    if (updateArticlesError) {
      console.error('Failed to update articles:', updateArticlesError);
      throw new Error('Failed to update article status');
    }

    console.log('Articles updated to paid status:', payment.article_ids);

    // Update discount code usage if applicable
    if (payment.discount_code) {
      const { data: discountData } = await serviceClient
        .from('discount_codes')
        .select('used_count')
        .eq('code', payment.discount_code)
        .single();
      
      if (discountData) {
        await serviceClient
          .from('discount_codes')
          .update({ used_count: (discountData.used_count || 0) + 1 })
          .eq('code', payment.discount_code);
      }
    }

    // Fetch user profile and article titles for email
    const { data: userProfile } = await serviceClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const { data: articles } = await serviceClient
      .from('articles')
      .select('title')
      .in('id', payment.article_ids);

    const articleTitles = articles?.map(a => a.title) || [];

    // Send payment confirmation emails
    const emailData = {
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      finalAmount: payment.final_amount,
      discountCode: payment.discount_code,
      discountAmount: payment.discount_amount,
      transactionId: transactionDetails,
      paymentDate: new Date().toLocaleDateString(),
      authorName: userProfile?.full_name || user.email?.split('@')[0] || 'Author',
      authorEmail: userProfile?.email || user.email,
      articleTitles,
    };

    // Send to author
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          to: userProfile?.email || user.email,
          template: 'payment-confirmation',
          data: emailData,
          isAdmin: false,
        }),
      });
      console.log('Payment confirmation email sent to author');
    } catch (emailError) {
      console.error('Failed to send author payment email:', emailError);
    }

    // Send to admin
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          to: 'info@wwjmrd.com',
          template: 'payment-confirmation',
          data: emailData,
          isAdmin: true,
        }),
      });
      console.log('Payment confirmation email sent to admin');
    } catch (emailError) {
      console.error('Failed to send admin payment email:', emailError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Payment verified successfully',
        articleIds: payment.article_ids,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error verifying payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
