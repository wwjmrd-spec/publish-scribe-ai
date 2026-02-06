import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
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

    const user = { id: claimsData.claims.sub as string };
    console.log('Creating Razorpay order for user:', user.id);

    const { articleIds, amount, discountCode, discountAmount, currency } = await req.json();

    if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      throw new Error('No articles selected');
    }

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    if (!currency || !['INR', 'USD'].includes(currency)) {
      throw new Error('Invalid currency');
    }

    const finalAmount = amount - (discountAmount || 0);
    // Razorpay uses smallest currency unit (paise for INR, cents for USD)
    const amountInSmallestUnit = Math.round(finalAmount * 100);

    console.log('Order details:', { articleIds, amount, discountAmount, finalAmount, amountInSmallestUnit, currency });

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
        receipt: `rcpt_${Date.now()}`,
        notes: {
          user_id: user.id,
          article_ids: articleIds.join(','),
          discount_code: discountCode || '',
        },
      }),
    });

    if (!orderResponse.ok) {
      const errorData = await orderResponse.text();
      console.error('Razorpay order creation failed:', errorData);
      throw new Error('Failed to create payment order');
    }

    const orderData = await orderResponse.json();
    console.log('Razorpay order created:', orderData.id);

    // Create payment record in database
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: payment, error: paymentError } = await serviceClient
      .from('payments')
      .insert({
        user_id: user.id,
        article_ids: articleIds,
        amount: amount,
        discount_code: discountCode || null,
        discount_amount: discountAmount || 0,
        final_amount: finalAmount,
        currency: currency,
        payment_gateway: 'razorpay',
        payment_status: 'pending',
        transaction_id: orderData.id,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Failed to create payment record:', paymentError);
      throw new Error('Failed to initialize payment');
    }

    console.log('Payment record created:', payment.id);

    return new Response(
      JSON.stringify({
        orderId: orderData.id,
        amount: amountInSmallestUnit,
        currency: currency,
        keyId: RAZORPAY_KEY_ID,
        paymentId: payment.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error creating Razorpay order:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create payment order. Please try again.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
