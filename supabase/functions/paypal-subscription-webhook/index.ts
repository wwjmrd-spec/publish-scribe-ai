import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyPayPalWebhook(req: Request, body: string): Promise<boolean> {
  const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
  const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');
  const PAYPAL_MODE = Deno.env.get('PAYPAL_MODE') || 'sandbox';

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) return false;

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
  if (!tokenRes.ok) return false;
  const { access_token } = await tokenRes.json();

  // Verify webhook signature
  const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: req.headers.get('paypal-auth-algo'),
      cert_url: req.headers.get('paypal-cert-url'),
      transmission_id: req.headers.get('paypal-transmission-id'),
      transmission_sig: req.headers.get('paypal-transmission-sig'),
      transmission_time: req.headers.get('paypal-transmission-time'),
      webhook_id: Deno.env.get('PAYPAL_WEBHOOK_ID') || '',
      webhook_event: JSON.parse(body),
    }),
  });

  if (!verifyRes.ok) {
    console.error('PayPal webhook verification API failed - rejecting webhook');
    return false;
  }

  const verifyData = await verifyRes.json();
  return verifyData.verification_status === 'SUCCESS';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Handle return/cancel redirects from PayPal subscription approval
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  
  if (action === 'return' || action === 'cancel') {
    // Redirect user back to frontend subscription page
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://wwjmrdai.lovable.app';
    const redirectUrl = action === 'return'
      ? `${frontendUrl}/author/subscription?paypal_sub=success`
      : `${frontendUrl}/author/subscription?paypal_sub=cancelled`;
    
    return new Response(null, {
      status: 302,
      headers: { 'Location': redirectUrl },
    });
  }

  try {
    const body = await req.text();
    const event = JSON.parse(body);
    const eventType = event.event_type;
    console.log('PayPal webhook event:', eventType);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' || eventType === 'PAYMENT.SALE.COMPLETED') {
      const resource = event.resource;
      
      let userId: string | null = null;
      let subscriptionId: string | null = null;
      let amount = 19;
      let currency = 'USD';

      if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
        userId = resource.custom_id;
        subscriptionId = resource.id;
      } else if (eventType === 'PAYMENT.SALE.COMPLETED') {
        // For recurring charges, get subscription details
        subscriptionId = resource.billing_agreement_id;
        amount = parseFloat(resource.amount?.total || '19');
        currency = resource.amount?.currency || 'USD';

        // Look up user from existing subscription record
        if (subscriptionId) {
          const { data: existingSub } = await serviceClient
            .from('user_subscriptions')
            .select('user_id')
            .eq('paypal_subscription_id', subscriptionId)
            .limit(1)
            .maybeSingle();
          
          userId = existingSub?.user_id || null;
        }
      }

      if (!userId) {
        console.error('No user_id found for PayPal event');
        return new Response('OK', { status: 200 });
      }

      console.log(`Processing ${eventType} for user ${userId}`);

      // Deactivate existing subscriptions
      await serviceClient
        .from('user_subscriptions')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      await serviceClient
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          plan_type: 'pro',
          starts_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          is_active: true,
          auto_renew: true,
          paypal_subscription_id: subscriptionId,
        });

      // Create payment record
      await serviceClient
        .from('payments')
        .insert({
          user_id: userId,
          article_ids: [],
          amount,
          final_amount: amount,
          currency,
          payment_gateway: 'paypal',
          payment_status: 'success',
          transaction_id: resource.id,
          discount_code: 'PRO_SUBSCRIPTION_RECURRING',
        });

      const isRenewal = eventType === 'PAYMENT.SALE.COMPLETED';
      await serviceClient.from('notifications').insert({
        user_id: userId,
        title: isRenewal ? 'Pro Plan Renewed! 🔄' : 'Pro Plan Activated! 🎉',
        message: isRenewal
          ? `Your Pro subscription has been renewed until ${expiresAt.toLocaleDateString()}.`
          : `Your Pro subscription is now active until ${expiresAt.toLocaleDateString()}. Enjoy!`,
        type: 'success',
        link: '/author/subscription',
      });

      // Send email
      try {
        const { data: profile } = await serviceClient
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        if (profile?.email) {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              to: profile.email,
              template: 'payment-confirmation',
              data: {
                authorName: profile.full_name,
                authorEmail: profile.email,
                amount,
                currency,
                finalAmount: amount,
                transactionId: resource.id,
                paymentDate: new Date().toLocaleDateString(),
                articleTitles: [isRenewal ? 'Pro Plan Renewal (1 Month)' : 'Pro Plan Subscription (1 Month)'],
              },
              isAdmin: false,
            }),
          });
        }
      } catch (e) {
        console.error('Email send failed:', e);
      }

      console.log(`PayPal subscription processed for user ${userId}`);
    }

    if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
      const subscriptionId = event.resource?.id;
      if (subscriptionId) {
        const { data: sub } = await serviceClient
          .from('user_subscriptions')
          .select('user_id')
          .eq('paypal_subscription_id', subscriptionId)
          .limit(1)
          .maybeSingle();

        if (sub?.user_id) {
          await serviceClient
            .from('user_subscriptions')
            .update({ auto_renew: false })
            .eq('paypal_subscription_id', subscriptionId);

          await serviceClient.from('notifications').insert({
            user_id: sub.user_id,
            title: 'Auto-Pay Cancelled',
            message: 'Your PayPal subscription auto-renewal has been cancelled. Your plan remains active until expiry.',
            type: 'warning',
            link: '/author/subscription',
          });
        }
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error: unknown) {
    console.error('PayPal webhook error:', error);
    return new Response('Error', { status: 500 });
  }
});
