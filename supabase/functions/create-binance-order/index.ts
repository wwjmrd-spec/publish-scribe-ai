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
    const { items, amount, discountCode, discountAmount } = body;

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Determine article IDs and payment items
    let articleIds: string[] = [];
    let paymentItems: any[] = [];

    if (items && Array.isArray(items) && items.length > 0) {
      articleIds = items.filter((i: any) => i.type === 'article_fee' && i.articleId).map((i: any) => i.articleId);
      paymentItems = items;

      // Validate subscription eligibility
      const hasSubscription = items.some((i: any) => i.type === 'pro_subscription');
      if (hasSubscription) {
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

      // Validate and create cert records for co-author certificates
      const coauthorCerts = items.filter((i: any) => i.type === 'coauthor_certificate');
      for (const cert of coauthorCerts) {
        if (!cert.coAuthorId || !cert.articleId) {
          throw new Error('Invalid co-author certificate data');
        }

        const { data: article } = await serviceClient
          .from('articles')
          .select('id')
          .eq('id', cert.articleId)
          .eq('author_id', userId)
          .eq('status', 'published')
          .single();

        if (!article) throw new Error('Article not found, not yours, or not published');

        const { data: coAuthor } = await serviceClient
          .from('co_authors')
          .select('id, name')
          .eq('id', cert.coAuthorId)
          .eq('article_id', cert.articleId)
          .single();

        if (!coAuthor) throw new Error('Co-author not found for this article');

        const { data: existingCert } = await serviceClient
          .from('co_author_certificates')
          .select('id, payment_status')
          .eq('co_author_id', cert.coAuthorId)
          .eq('article_id', cert.articleId)
          .maybeSingle();

        if (existingCert?.payment_status === 'paid') {
          throw new Error(`Certificate already paid for co-author: ${coAuthor.name}`);
        }

        if (existingCert) {
          await serviceClient
            .from('co_author_certificates')
            .update({ payment_status: 'pending', currency: 'USDT' })
            .eq('id', existingCert.id);
        } else {
          await serviceClient
            .from('co_author_certificates')
            .insert({
              co_author_id: cert.coAuthorId,
              article_id: cert.articleId,
              payment_status: 'pending',
              currency: 'USDT',
            });
        }
      }
    } else {
      throw new Error('No items provided');
    }

    const finalAmount = amount - (discountAmount || 0);

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
        discount_code: discountCode || null,
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
