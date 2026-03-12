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

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find active subscription with auto_renew
    const { data: activeSub } = await serviceClient
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('plan_type', 'pro')
      .maybeSingle();

    if (!activeSub) {
      throw new Error('No active subscription found');
    }

    const razorpaySubId = activeSub.razorpay_subscription_id;
    const paypalSubId = activeSub.paypal_subscription_id;

    // Cancel on Razorpay
    if (razorpaySubId) {
      const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
      const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
      
      if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
        const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpaySubId}/cancel`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cancel_at_cycle_end: 1 }),
        });
        const resText = await res.text();
        console.log('Razorpay cancel response:', res.status, resText);
      }
    }

    // Cancel on PayPal
    if (paypalSubId) {
      const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
      const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');
      const PAYPAL_MODE = Deno.env.get('PAYPAL_MODE') || 'sandbox';

      if (PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET) {
        const baseUrl = PAYPAL_MODE === 'live'
          ? 'https://api-m.paypal.com'
          : 'https://api-m.sandbox.paypal.com';

        const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });

        if (tokenRes.ok) {
          const { access_token } = await tokenRes.json();
          const cancelRes = await fetch(`${baseUrl}/v1/billing/subscriptions/${paypalSubId}/cancel`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reason: 'User requested cancellation' }),
          });
          const cancelText = await cancelRes.text();
          console.log('PayPal cancel response:', cancelRes.status, cancelText);
        }
      }
    }

    // Update DB
    await serviceClient
      .from('user_subscriptions')
      .update({ auto_renew: false })
      .eq('id', activeSub.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Auto-renewal cancelled. Your plan remains active until expiry.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Cancel subscription error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
