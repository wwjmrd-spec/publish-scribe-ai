import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { priceCart } from "../_shared/pricing.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Use sandbox URL for testing; switch to 'https://api-m.paypal.com' for production
const PAYPAL_BASE_URL = Deno.env.get('PAYPAL_MODE') === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const auth = btoa(`${clientId}:${clientSecret}`);
  
  console.log('PayPal mode:', Deno.env.get('PAYPAL_MODE') || 'sandbox (default)');
  console.log('PayPal base URL:', PAYPAL_BASE_URL);
  console.log('PayPal Client ID (first 8 chars):', clientId.substring(0, 8) + '...');

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('PayPal auth failed:', errorData);
    throw new Error('Failed to authenticate with PayPal');
  }

  const data = await response.json();
  return data.access_token;
}

const ALLOWED_RETURN_ORIGINS = [
  'https://wwjmrdai.online',
  'https://www.wwjmrdai.online',
  'https://wwjmrdai.lovable.app',
  'https://id-preview--7fb6d7a3-9d67-46c8-b220-2239f19803b5.lovable.app',
];

/** Only return payers to this app's own pages. */
function safeReturnUrl(value: unknown): string {
  const fallback = 'https://wwjmrdai.online/author/cart';
  if (typeof value !== 'string') return fallback;
  try {
    const u = new URL(value);
    if (!ALLOWED_RETURN_ORIGINS.includes(u.origin) || !u.pathname.startsWith('/author/')) return fallback;
    return `${u.origin}${u.pathname}`;
  } catch {
    return fallback;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
    const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');

    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      console.error('PayPal credentials not configured');
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
    console.log('Creating PayPal order for user:', userId);

    const body = await req.json();
    const { discountCode, currency, returnUrl } = body;

    if (!currency || !['INR', 'USD'].includes(currency)) {
      throw new Error('Invalid currency');
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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

    console.log('Order details:', { itemCount: paymentItems.length, amount, discountAmount, finalAmount, currency });

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);

    // Build description
    const descParts: string[] = [];
    const articleCount = paymentItems.filter((i: any) => i.type === 'article_fee').length;
    const hasSubscription = paymentItems.some((i: any) => i.type === 'pro_subscription');
    const certCount = paymentItems.filter((i: any) => i.type === 'coauthor_certificate').length;
    if (articleCount > 0) descParts.push(`${articleCount} article(s)`);
    if (hasSubscription) descParts.push('Pro Plan');
    if (certCount > 0) descParts.push(`${certCount} certificate(s)`);

    // PayPal only supports specific currencies; for INR we convert display but PayPal charges in USD
    const paypalCurrency = currency === 'INR' ? 'USD' : currency;
    const paypalAmount = currency === 'INR' ? (finalAmount / 85).toFixed(2) : finalAmount.toFixed(2);

    // Create PayPal order
    const baseReturnUrl = safeReturnUrl(returnUrl);
    const orderResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: paypalCurrency,
            value: paypalAmount,
          },
          description: `Payment for ${descParts.join(', ')}`,
          custom_id: userId,
        }],
        application_context: {
          brand_name: 'WWJMRD',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${baseReturnUrl}?paypal=success`,
          cancel_url: `${baseReturnUrl}?paypal=cancelled`,
        },
      }),
    });

    if (!orderResponse.ok) {
      const errorData = await orderResponse.text();
      console.error('PayPal order creation failed:', errorData);
      throw new Error('Failed to create PayPal order');
    }

    const orderData = await orderResponse.json();
    console.log('PayPal order created:', orderData.id);

    // Create payment record in database
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
        payment_gateway: 'paypal',
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

    const approvalUrl = orderData.links.find((link: any) => link.rel === 'approve')?.href;

    return new Response(
      JSON.stringify({
        orderId: orderData.id,
        approvalUrl: approvalUrl,
        paymentId: payment.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating PayPal order:', message);
    return new Response(
      JSON.stringify({ error: message || 'Failed to create payment order. Please try again.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
