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

const PAYPAL_BASE_URL = Deno.env.get('PAYPAL_MODE') === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const auth = btoa(`${clientId}:${clientSecret}`);
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

async function capturePayPalOrder(orderId: string, accessToken: string): Promise<any> {
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('PayPal capture failed:', errorData);
    throw new Error('Failed to capture PayPal payment');
  }

  return await response.json();
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
    console.log('Authenticated user for payment verification:', userId);

    const { gateway, paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature, paypalOrderId } = await req.json();

    console.log('Verifying payment:', { gateway, paymentId });

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

    // Verify payment based on gateway
    let capturedTransactionId: string | null = null;

    if (gateway === 'razorpay') {
      const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
      if (!RAZORPAY_KEY_SECRET) {
        throw new Error('Payment gateway not configured');
      }

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

      capturedTransactionId = razorpayPaymentId;
    } else if (gateway === 'paypal') {
      const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
      const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET');

      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        throw new Error('PayPal gateway not configured');
      }

      const orderIdToCapture = paypalOrderId || payment.transaction_id;
      if (!orderIdToCapture) {
        throw new Error('PayPal order ID missing');
      }

      console.log('Capturing PayPal order:', orderIdToCapture);

      const accessToken = await getPayPalAccessToken(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
      const captureResult = await capturePayPalOrder(orderIdToCapture, accessToken);

      console.log('PayPal capture result status:', captureResult.status);

      if (captureResult.status !== 'COMPLETED') {
        await serviceClient
          .from('payments')
          .update({ payment_status: 'failed' })
          .eq('id', paymentId);

        throw new Error('PayPal payment not completed');
      }

      // Extract capture ID
      const captures = captureResult.purchase_units?.[0]?.payments?.captures;
      capturedTransactionId = captures?.[0]?.id || orderIdToCapture;
      console.log('PayPal payment captured, transaction ID:', capturedTransactionId);
    } else {
      throw new Error('Invalid payment gateway');
    }

    // Update payment as successful
    const { error: updatePaymentError } = await serviceClient
      .from('payments')
      .update({ 
        payment_status: 'success',
        transaction_id: capturedTransactionId,
      })
      .eq('id', paymentId);

    if (updatePaymentError) {
      console.error('Failed to update payment:', updatePaymentError);
      throw new Error('Failed to update payment status');
    }

    // Process payment items
    const paymentItems = payment.payment_items || [];
    const itemDescriptions: string[] = [];

    if (paymentItems.length > 0) {
      console.log('Processing unified payment items:', paymentItems.length);

      // Collect article IDs from items
      const articleIdsFromItems = paymentItems
        .filter((i: any) => i.type === 'article_fee' && i.articleId)
        .map((i: any) => i.articleId);

      // Update article statuses
      if (articleIdsFromItems.length > 0) {
        const { error: updateArticlesError } = await serviceClient
          .from('articles')
          .update({ status: 'paid' })
          .in('id', articleIdsFromItems);

        if (updateArticlesError) {
          console.error('Failed to update articles:', updateArticlesError);
        } else {
          console.log('Articles updated to paid:', articleIdsFromItems.length);
        }

        // Get article titles for email
        const { data: articles } = await serviceClient
          .from('articles')
          .select('title')
          .in('id', articleIdsFromItems);
        
        if (articles) {
          itemDescriptions.push(...articles.map(a => `Article: ${a.title}`));
        }
      }

      // Process Pro subscription
      const hasSubscription = paymentItems.some((i: any) => i.type === 'pro_subscription');
      if (hasSubscription) {
        console.log('Activating Pro subscription for user:', userId);

        // Deactivate existing subscriptions
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
        } else {
          console.log('Pro subscription activated until:', expiresAt.toISOString());

          // Create notification
          await serviceClient
            .from('notifications')
            .insert({
              user_id: userId,
              title: 'Pro Plan Activated! 🎉',
              message: `Your Pro subscription is now active until ${expiresAt.toLocaleDateString()}. Enjoy 5 review reports and 4 co-author certificates per month!`,
              type: 'success',
            });

          itemDescriptions.push('Pro Plan Subscription (1 Month)');
        }
      }

      // Process co-author certificates
      const coauthorCerts = paymentItems.filter((i: any) => i.type === 'coauthor_certificate');
      for (const cert of coauthorCerts) {
        if (!cert.coAuthorId || !cert.articleId) continue;

        console.log('Processing co-author certificate:', cert.coAuthorId);

        try {
          // Call generate-free-coauthor-cert internally to generate the PDF
          const certResponse = await fetch(`${supabaseUrl}/functions/v1/generate-free-coauthor-cert`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              coAuthorId: cert.coAuthorId,
              articleId: cert.articleId,
              userId: userId,
              paidViaCart: true,
            }),
          });

          const certResult = await certResponse.json();
          if (certResult.error) {
            console.error('Cert generation error:', certResult.error);
          } else {
            console.log('Co-author certificate generated successfully');
          }

          // Get co-author name for email
          const { data: coAuthor } = await serviceClient
            .from('co_authors')
            .select('name')
            .eq('id', cert.coAuthorId)
            .single();

          if (coAuthor) {
            itemDescriptions.push(`Co-Author Certificate: ${coAuthor.name}`);
          }
        } catch (certError) {
          console.error('Failed to generate co-author certificate:', certError);
        }
      }
    } else {
      // Legacy flow - article-only payments
      if (payment.article_ids && payment.article_ids.length > 0) {
        const { error: updateArticlesError } = await serviceClient
          .from('articles')
          .update({ status: 'paid' })
          .in('id', payment.article_ids);

        if (updateArticlesError) {
          console.error('Failed to update articles:', updateArticlesError);
        }

        console.log('Articles updated to paid status (legacy):', payment.article_ids);

        const { data: articles } = await serviceClient
          .from('articles')
          .select('title')
          .in('id', payment.article_ids);

        if (articles) {
          itemDescriptions.push(...articles.map(a => a.title));
        }
      }
    }

    // Update discount code usage if applicable
    if (payment.discount_code && payment.discount_code !== 'PRO_SUBSCRIPTION') {
      const { data: discountData } = await serviceClient
        .from('discount_codes')
        .select('used_count')
        .eq('code', payment.discount_code)
        .single();
      
      if (discountData) {
        await serviceClient
          .from('discount_codes')
          .update({ used_count: (discountData.used_count || 0) + 1 })
          .eq('code', payment.discount_code);
      }
    }

    // Send payment confirmation emails
    const { data: userProfile } = await serviceClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const emailData = {
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      finalAmount: payment.final_amount,
      discountCode: payment.discount_code,
      discountAmount: payment.discount_amount,
      transactionId: capturedTransactionId,
      paymentDate: new Date().toLocaleDateString(),
      authorName: userProfile?.full_name || 'Author',
      authorEmail: userProfile?.email,
      articleTitles: itemDescriptions.length > 0 ? itemDescriptions : ['Payment'],
    };

    // Send to author
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
          data: emailData,
          isAdmin: false,
        }),
      });
      console.log('Payment confirmation email sent to author');
    } catch (emailError) {
      console.error('Failed to send author payment email:', emailError);
    }

    // Send to admin
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
          data: emailData,
          isAdmin: true,
        }),
      });
      console.log('Payment confirmation email sent to admin');
    } catch (emailError) {
      console.error('Failed to send admin payment email:', emailError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Payment verified successfully',
        articleIds: payment.article_ids,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error verifying payment:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message || 'Payment verification failed. Please try again or contact support.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
