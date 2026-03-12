import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
      throw new Error('Unauthorized');
    }

    const userId = claimsData.claims.sub as string;
    const { gateway, currency } = await req.json();

    if (!gateway || !['razorpay', 'paypal'].includes(gateway)) {
      throw new Error('Invalid gateway. Must be razorpay or paypal.');
    }
    if (!currency || !['INR', 'USD'].includes(currency)) {
      throw new Error('Invalid currency');
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check existing active subscription
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

    // Get user profile
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    if (!profile) throw new Error('User profile not found');

    if (gateway === 'razorpay') {
      return await handleRazorpay(userId, currency, profile, serviceClient, supabaseUrl);
    } else {
      return await handlePayPal(userId, currency, profile, serviceClient, supabaseUrl);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating recurring subscription:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleRazorpay(
  userId: string,
  currency: string,
  profile: { full_name: string; email: string },
  serviceClient: any,
  supabaseUrl: string,
) {
  const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
  const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
  const planId = currency === 'INR'
    ? Deno.env.get('RAZORPAY_PLAN_ID_INR')
    : Deno.env.get('RAZORPAY_PLAN_ID_USD');

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !planId) {
    throw new Error('Payment gateway not configured');
  }

  const razorpayAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

  // Create Razorpay Subscription
  const subResponse = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${razorpayAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: planId,
      total_count: 12, // Max 12 months
      quantity: 1,
      customer_notify: 0, // We handle notifications
      notes: {
        user_id: userId,
        type: 'pro_subscription',
      },
    }),
  });

  if (!subResponse.ok) {
    const errorData = await subResponse.text();
    console.error('Razorpay subscription creation failed:', errorData);
    throw new Error('Failed to create subscription');
  }

  const subData = await subResponse.json();
  console.log('Razorpay subscription created:', subData.id);

  return new Response(
    JSON.stringify({
      gateway: 'razorpay',
      subscriptionId: subData.id,
      keyId: RAZORPAY_KEY_ID,
      shortUrl: subData.short_url,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handlePayPal(
  userId: string,
  currency: string,
  profile: { full_name: string; email: string },
  serviceClient: any,
  supabaseUrl: string,
) {
  const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
  const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');
  const PAYPAL_PLAN_ID = Deno.env.get('PAYPAL_PLAN_ID');
  const PAYPAL_MODE = Deno.env.get('PAYPAL_MODE') || 'sandbox';

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_PLAN_ID) {
    throw new Error('PayPal not configured');
  }

  const baseUrl = PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  // Get access token
  const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('PayPal token error:', errText);
    throw new Error('PayPal authentication failed');
  }

  const { access_token } = await tokenRes.json();

  // Create PayPal subscription
  const returnUrl = `${supabaseUrl}/functions/v1/paypal-subscription-webhook?action=return&user_id=${userId}`;
  const cancelUrl = `${supabaseUrl}/functions/v1/paypal-subscription-webhook?action=cancel&user_id=${userId}`;

  const subRes = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: PAYPAL_PLAN_ID,
      subscriber: {
        name: { given_name: profile.full_name },
        email_address: profile.email,
      },
      application_context: {
        brand_name: 'WWJMRD',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
      custom_id: userId,
    }),
  });

  if (!subRes.ok) {
    const errText = await subRes.text();
    console.error('PayPal subscription creation failed:', errText);
    throw new Error('Failed to create PayPal subscription');
  }

  const subData = await subRes.json();
  const approvalLink = subData.links?.find((l: any) => l.rel === 'approve');

  if (!approvalLink) throw new Error('PayPal approval link not found');

  console.log('PayPal subscription created:', subData.id);

  return new Response(
    JSON.stringify({
      gateway: 'paypal',
      subscriptionId: subData.id,
      approvalUrl: approvalLink.href,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
