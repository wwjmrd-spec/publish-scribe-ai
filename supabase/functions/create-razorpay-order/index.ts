import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { priceCart } from "../_shared/pricing.ts";

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
    console.log('Creating Razorpay order for user:', userId);

    const body = await req.json();
    const { discountCode, currency } = body;

    if (!currency || !['INR', 'USD'].includes(currency)) {
      throw new Error('Invalid currency');
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Legacy callers send articleIds; convert them to article-fee items.
    const rawItems = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : Array.isArray(body.articleIds) ? body.articleIds.map((id: string) => ({ type: 'article_fee', articleId: id })) : [];

    // Prices, ownership and discounts are all derived server-side.
    const priced = await priceCart(serviceClient, userId, rawItems, currency, discountCode);
    const articleIds = priced.articleIds;
    const paymentItems = priced.paymentItems;
    const amount = priced.subtotal;
    const discountAmount = priced.discount;

    if (paymentItems.some((i: any) => i.type === 'pro_subscription')) {
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
    }

    for (const cert of paymentItems.filter((i: any) => i.type === 'coauthor_certificate')) {
      const { data: existingCert } = await serviceClient
        .from('co_author_certificates')
        .select('id, payment_status')
        .eq('co_author_id', cert.coAuthorId)
        .eq('article_id', cert.articleId)
        .maybeSingle();
      if (existingCert?.payment_status === 'paid') throw new Error('Certificate already paid for this co-author');
      if (existingCert) {
        await serviceClient.from('co_author_certificates').update({ payment_status: 'pending', currency }).eq('id', existingCert.id);
      } else {
        await serviceClient.from('co_author_certificates').insert({
          co_author_id: cert.coAuthorId, article_id: cert.articleId, payment_status: 'pending', currency,
        });
      }
    }

    const finalAmount = priced.finalAmount;
    const amountInSmallestUnit = Math.round(finalAmount * 100);

    console.log('Order details:', { itemCount: paymentItems.length, amount, discountAmount, finalAmount, currency });

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
          user_id: userId,
          item_count: String(paymentItems.length),
          discount_code: priced.discountCode || '',
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

    // Create payment record
    const { data: payment, error: paymentError } = await serviceClient
      .from('payments')
      .insert({
        user_id: userId,
        article_ids: articleIds,
        amount: amount,
        discount_code: priced.discountCode,
        discount_amount: discountAmount || 0,
        final_amount: finalAmount,
        currency: currency,
        payment_gateway: 'razorpay',
        payment_status: 'pending',
        transaction_id: orderData.id,
        payment_items: paymentItems,
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating Razorpay order:', message);
    return new Response(
      JSON.stringify({ error: message || 'Failed to create payment order. Please try again.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
