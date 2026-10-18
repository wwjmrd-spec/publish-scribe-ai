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
    const BINANCE_WALLET_ADDRESS = Deno.env.get('BINANCE_WALLET_ADDRESS');
    if (!BINANCE_WALLET_ADDRESS) {
      throw new Error('Binance wallet not configured');
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
      throw new Error('Unauthorized');
    }

    const userId = claimsData.claims.sub as string;
    console.log('Creating Binance USDT order for user:', userId);

    const body = await req.json();
    const { discountCode } = body;

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Prices, ownership and discounts are all derived server-side.
    const priced = await priceCart(serviceClient, userId, body.items, 'USDT', discountCode);
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
        await serviceClient.from('co_author_certificates').update({ payment_status: 'pending', currency: 'USDT' }).eq('id', existingCert.id);
      } else {
        await serviceClient.from('co_author_certificates').insert({
          co_author_id: cert.coAuthorId, article_id: cert.articleId, payment_status: 'pending', currency: 'USDT',
        });
      }
    }

    const finalAmount = priced.finalAmount;

    // Also fetch wallet address from publication_fees if stored there
    const { data: feeSettings } = await serviceClient
      .from('publication_fees')
      .select('binance_wallet_address')
      .limit(1)
      .single();

    const walletAddress = feeSettings?.binance_wallet_address || BINANCE_WALLET_ADDRESS;

    // Create payment record with status 'under_review'
    const { data: payment, error: paymentError } = await serviceClient
      .from('payments')
      .insert({
        user_id: userId,
        article_ids: articleIds,
        amount: amount,
        discount_code: priced.discountCode,
        discount_amount: discountAmount || 0,
        final_amount: finalAmount,
        currency: 'USDT',
        payment_gateway: 'binance',
        payment_status: 'under_review',
        payment_items: paymentItems,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Failed to create payment record:', paymentError);
      throw new Error('Failed to initialize payment');
    }

    console.log('Binance USDT payment record created:', payment.id);

    // Notify admins about pending USDT payment
    const { data: admins } = await serviceClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (admins) {
      for (const admin of admins) {
        await serviceClient
          .from('notifications')
          .insert({
            user_id: admin.user_id,
            title: 'New USDT Payment Pending ₮',
            message: `A USDT payment of ${finalAmount} USDT is pending verification. Payment ID: ${payment.id.slice(0, 8)}...`,
            type: 'info',
            link: '/admin/articles',
          });
      }
    }

    return new Response(
      JSON.stringify({
        paymentId: payment.id,
        walletAddress,
        amount: finalAmount,
        currency: 'USDT',
        network: 'TRC20',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating Binance order:', message);
    return new Response(
      JSON.stringify({ error: message || 'Failed to create USDT payment order' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
