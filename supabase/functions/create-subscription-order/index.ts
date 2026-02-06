import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.error('Razorpay credentials not configured');
      throw new Error('Payment gateway not configured');
    }

    // Authenticate user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Authorization header required');
    }

    const authClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error('Auth verification failed:', claimsError?.message);
      throw new Error('Unauthorized');
    }

    const userId = claimsData.claims.sub as string;
    console.log('Creating subscription order for user:', userId);

    const { currency } = await req.json();

    if (!currency || !['INR', 'USD'].includes(currency)) {
      throw new Error('Invalid currency');
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if user already has active pro subscription
    const { data: existingSub } = await serviceClient
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('plan_type', 'pro')
      .maybeSingle();

    if (existingSub && existingSub.expires_at && new Date(existingSub.expires_at) > new Date()) {
      throw new Error('You already have an active Pro subscription');
    }

    // Get Pro fee from publication_fees table
    const { data: fees, error: feesError } = await serviceClient
      .from('publication_fees')
      .select('indian_pro_fee, international_pro_fee')
      .limit(1)
      .single();

    if (feesError || !fees) {
      console.error('Failed to fetch fees:', feesError);
      throw new Error('Unable to fetch subscription fee');
    }

    const amount = currency === 'INR' 
      ? Number(fees.indian_pro_fee) || 999 
      : Number(fees.international_pro_fee) || 19;

    const amountInSmallestUnit = Math.round(amount * 100);

    console.log('Subscription order details:', { amount, amountInSmallestUnit, currency });

    // Create Razorpay order
    const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    
    const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${razorpayAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInSmallestUnit,
        currency: currency,
        receipt: `sub_${Date.now()}`,
        notes: {
          user_id: userId,
          type: 'pro_subscription',
        },
      }),
    });

    if (!orderResponse.ok) {
      const errorData = await orderResponse.text();
      console.error('Razorpay order creation failed:', errorData);
      throw new Error('Failed to create payment order');
    }

    const orderData = await orderResponse.json();
    console.log('Razorpay subscription order created:', orderData.id);

    // Create payment record
    const { data: payment, error: paymentError } = await serviceClient
      .from('payments')
      .insert({
        user_id: userId,
        article_ids: [], // Empty for subscription payments
        amount: amount,
        final_amount: amount,
        currency: currency,
        payment_gateway: 'razorpay',
        payment_status: 'pending',
        transaction_id: orderData.id,
        discount_code: 'PRO_SUBSCRIPTION', // Mark as subscription payment
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Failed to create payment record:', paymentError);
      throw new Error('Failed to initialize payment');
    }

    console.log('Subscription payment record created:', payment.id);

    return new Response(
      JSON.stringify({
        orderId: orderData.id,
        amount: amountInSmallestUnit,
        currency: currency,
        keyId: RAZORPAY_KEY_ID,
        paymentId: payment.id,
        proFee: amount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating subscription order:', message);
    return new Response(
      JSON.stringify({ error: 'Failed to create subscription order. Please try again.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});