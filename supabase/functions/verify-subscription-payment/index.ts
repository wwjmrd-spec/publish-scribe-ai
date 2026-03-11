import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
      console.error('Auth verification failed:', claimsError?.message);
      throw new Error('Unauthorized');
    }

    const userId = claimsData.claims.sub as string;
    console.log('Verifying subscription payment for user:', userId);

    const { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = await req.json();

    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!RAZORPAY_KEY_SECRET) {
      throw new Error('Payment gateway not configured');
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get payment record
    const { data: payment, error: paymentFetchError } = await serviceClient
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('user_id', userId)
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

    // Verify Razorpay signature
    const verified = await verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      RAZORPAY_KEY_SECRET
    );

    console.log('Razorpay signature verification:', verified);

    if (!verified) {
      await serviceClient
        .from('payments')
        .update({ payment_status: 'failed' })
        .eq('id', paymentId);

      throw new Error('Payment verification failed');
    }

    // Update payment as successful
    await serviceClient
      .from('payments')
      .update({ 
        payment_status: 'success',
        transaction_id: razorpayPaymentId,
      })
      .eq('id', paymentId);

    // Deactivate any existing active subscriptions
    await serviceClient
      .from('user_subscriptions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);

    // Create new Pro subscription (1 month)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { error: subError } = await serviceClient
      .from('user_subscriptions')
      .insert({
        user_id: userId,
        plan_type: 'pro',
        starts_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        is_active: true,
        payment_id: paymentId,
      });

    if (subError) {
      console.error('Failed to create subscription:', subError);
      throw new Error('Payment succeeded but subscription activation failed. Please contact support.');
    }

    console.log('Pro subscription activated for user:', userId);

    // Send confirmation emails
    const { data: userProfile } = await serviceClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Create notification
    await serviceClient
      .from('notifications')
      .insert({
        user_id: userId,
        title: 'Pro Plan Activated! 🎉',
        message: `Your Pro subscription is now active until ${expiresAt.toLocaleDateString()}. Enjoy 5 review reports and 4 co-author certificates per month!`,
        type: 'success',
      });

    // Send email to author
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to: userProfile?.email,
          template: 'payment-confirmation',
          data: {
            paymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            finalAmount: payment.final_amount,
            transactionId: razorpayPaymentId,
            paymentDate: new Date().toLocaleDateString(),
            authorName: userProfile?.full_name || 'Author',
            authorEmail: userProfile?.email,
            articleTitles: ['Pro Plan Subscription (1 Month)'],
          },
          isAdmin: false,
        }),
      });
    } catch (emailError) {
      console.error('Failed to send subscription email:', emailError);
    }

    // Send email to admin
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to: 'shubhmeena23@gmail.com',
          template: 'payment-confirmation',
          data: {
            paymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            finalAmount: payment.final_amount,
            transactionId: razorpayPaymentId,
            paymentDate: new Date().toLocaleDateString(),
            authorName: userProfile?.full_name || 'Author',
            authorEmail: userProfile?.email,
            articleTitles: ['Pro Plan Subscription (1 Month)'],
          },
          isAdmin: true,
        }),
      });
    } catch (emailError) {
      console.error('Failed to send admin subscription email:', emailError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Subscription activated successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error verifying subscription payment:', message);
    return new Response(
      JSON.stringify({ error: 'Subscription payment verification failed. Please contact support.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});