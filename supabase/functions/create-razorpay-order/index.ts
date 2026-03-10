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
    const { items, amount, discountCode, discountAmount, currency } = body;

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    if (!currency || !['INR', 'USD'].includes(currency)) {
      throw new Error('Invalid currency');
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Determine article IDs from items
    let articleIds: string[] = [];
    let paymentItems: any[] = [];

    if (items && Array.isArray(items) && items.length > 0) {
      // New unified cart flow
      articleIds = items.filter((i: any) => i.type === 'article_fee' && i.articleId).map((i: any) => i.articleId);
      paymentItems = items;

      const hasSubscription = items.some((i: any) => i.type === 'pro_subscription');
      const coauthorCerts = items.filter((i: any) => i.type === 'coauthor_certificate');

      // Validate subscription eligibility
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
        console.log('Pro subscription validated for user:', userId);
      }

      // Validate and create cert records for co-author certificates
      for (const cert of coauthorCerts) {
        if (!cert.coAuthorId || !cert.articleId) {
          throw new Error('Invalid co-author certificate data');
        }

        // Verify article belongs to user and is published
        const { data: article, error: articleError } = await serviceClient
          .from('articles')
          .select('id, author_id, status')
          .eq('id', cert.articleId)
          .eq('author_id', userId)
          .eq('status', 'published')
          .single();

        if (articleError || !article) {
          throw new Error('Article not found, not yours, or not published');
        }

        // Verify co-author belongs to this article
        const { data: coAuthor, error: coAuthorError } = await serviceClient
          .from('co_authors')
          .select('id, name')
          .eq('id', cert.coAuthorId)
          .eq('article_id', cert.articleId)
          .single();

        if (coAuthorError || !coAuthor) {
          throw new Error('Co-author not found for this article');
        }

        // Check if already paid
        const { data: existingCert } = await serviceClient
          .from('co_author_certificates')
          .select('id, payment_status')
          .eq('co_author_id', cert.coAuthorId)
          .eq('article_id', cert.articleId)
          .maybeSingle();

        if (existingCert?.payment_status === 'paid') {
          throw new Error(`Certificate already paid for co-author: ${coAuthor.name}`);
        }

        // Create or update cert record as pending
        if (existingCert) {
          await serviceClient
            .from('co_author_certificates')
            .update({ payment_status: 'pending', currency })
            .eq('id', existingCert.id);
        } else {
          await serviceClient
            .from('co_author_certificates')
            .insert({
              co_author_id: cert.coAuthorId,
              article_id: cert.articleId,
              payment_status: 'pending',
              currency,
            });
        }

        console.log('Co-author cert record created/updated for:', coAuthor.name);
      }
    } else if (body.articleIds && Array.isArray(body.articleIds)) {
      // Legacy flow
      articleIds = body.articleIds;
      paymentItems = articleIds.map((id: string) => ({ type: 'article_fee', articleId: id }));

      if (articleIds.length === 0) {
        throw new Error('No articles selected');
      }
    } else {
      throw new Error('No items provided');
    }

    const finalAmount = amount - (discountAmount || 0);
    const amountInSmallestUnit = Math.round(finalAmount * 100);

    console.log('Order details:', { itemCount: paymentItems.length, amount, discountAmount, finalAmount, amountInSmallestUnit, currency });

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

    // Create payment record
    const { data: payment, error: paymentError } = await serviceClient
      .from('payments')
      .insert({
        user_id: userId,
        article_ids: articleIds,
        amount: amount,
        discount_code: discountCode || null,
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
