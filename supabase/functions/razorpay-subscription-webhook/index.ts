import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

async function verifyWebhookSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!RAZORPAY_KEY_SECRET) throw new Error('Not configured');

    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    const verified = await verifyWebhookSignature(body, signature, RAZORPAY_KEY_SECRET);
    if (!verified) {
      console.error('Razorpay webhook signature verification failed');
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(body);
    const eventType = event.event;
    console.log('Razorpay webhook event:', eventType);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (eventType === 'subscription.activated' || eventType === 'subscription.charged') {
      const subscription = event.payload?.subscription?.entity;
      const payment = event.payload?.payment?.entity;
      
      if (!subscription) {
        console.error('No subscription entity in payload');
        return new Response('OK', { status: 200 });
      }

      const userId = subscription.notes?.user_id;
      if (!userId) {
        console.error('No user_id in subscription notes');
        return new Response('OK', { status: 200 });
      }

      console.log(`Processing ${eventType} for user ${userId}, subscription ${subscription.id}`);

      // Deactivate existing subscriptions
      await serviceClient
        .from('user_subscriptions')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);

      // Create/renew subscription (1 month from now)
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
          razorpay_subscription_id: subscription.id,
        });

      // Create payment record
      const amount = payment ? payment.amount / 100 : subscription.plan_id?.includes('INR') ? 999 : 19;
      const currency = payment?.currency?.toUpperCase() || 'INR';

      await serviceClient
        .from('payments')
        .insert({
          user_id: userId,
          article_ids: [],
          amount,
          final_amount: amount,
          currency,
          payment_gateway: 'razorpay',
          payment_status: 'success',
          transaction_id: payment?.id || subscription.id,
          discount_code: 'PRO_SUBSCRIPTION_RECURRING',
        });

      // Notification
      const notifTitle = eventType === 'subscription.activated'
        ? 'Pro Plan Activated! 🎉'
        : 'Pro Plan Renewed! 🔄';
      const notifMessage = eventType === 'subscription.activated'
        ? `Your Pro subscription is now active until ${expiresAt.toLocaleDateString()}. Enjoy!`
        : `Your Pro subscription has been renewed until ${expiresAt.toLocaleDateString()}.`;

      await serviceClient.from('notifications').insert({
        user_id: userId,
        title: notifTitle,
        message: notifMessage,
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
                transactionId: payment?.id || subscription.id,
                paymentDate: new Date().toLocaleDateString(),
                articleTitles: [eventType === 'subscription.activated' ? 'Pro Plan Subscription (1 Month)' : 'Pro Plan Renewal (1 Month)'],
              },
              isAdmin: false,
            }),
          });
        }
      } catch (e) {
        console.error('Email send failed:', e);
      }

      console.log(`Subscription ${eventType} processed for user ${userId}`);
    }

    if (eventType === 'subscription.cancelled' || eventType === 'subscription.paused') {
      const subscription = event.payload?.subscription?.entity;
      const userId = subscription?.notes?.user_id;

      if (userId) {
        // Mark auto_renew as false but keep subscription active until expiry
        await serviceClient
          .from('user_subscriptions')
          .update({ auto_renew: false })
          .eq('user_id', userId)
          .eq('razorpay_subscription_id', subscription.id);

        await serviceClient.from('notifications').insert({
          user_id: userId,
          title: 'Auto-Pay Cancelled',
          message: 'Your subscription auto-renewal has been cancelled. Your current plan remains active until expiry.',
          type: 'warning',
          link: '/author/subscription',
        });
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Razorpay webhook error:', error);
    return new Response('Error', { status: 500 });
  }
});
