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
    const { paymentId, transactionHash, action } = await req.json();

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ACTION: submit_tx_hash — author submits their transaction hash
    if (action === 'submit_tx_hash') {
      if (!paymentId || !transactionHash) {
        throw new Error('Payment ID and transaction hash are required');
      }

      // Verify payment belongs to user
      const { data: payment, error: fetchError } = await serviceClient
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !payment) {
        throw new Error('Payment not found');
      }

      if (payment.payment_status === 'success') {
        return new Response(
          JSON.stringify({ success: true, message: 'Payment already verified' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update payment with transaction hash
      await serviceClient
        .from('payments')
        .update({
          transaction_id: transactionHash,
          payment_status: 'under_review',
        })
        .eq('id', paymentId);

      // Notify admins
      const { data: admins } = await serviceClient
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      const { data: userProfile } = await serviceClient
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

      if (admins) {
        for (const admin of admins) {
          await serviceClient
            .from('notifications')
            .insert({
              user_id: admin.user_id,
              title: 'USDT Transaction Hash Submitted ₮',
              message: `${userProfile?.full_name || 'Author'} submitted tx hash for USDT payment. Hash: ${transactionHash.slice(0, 16)}...`,
              type: 'info',
              link: '/admin/articles',
            });
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Transaction hash submitted for review' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: admin_verify — admin confirms the payment
    if (action === 'admin_verify') {
      // Check admin role
      const { data: roleData } = await serviceClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        throw new Error('Admin access required');
      }

      if (!paymentId) {
        throw new Error('Payment ID is required');
      }

      const { data: payment, error: fetchError } = await serviceClient
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (fetchError || !payment) {
        throw new Error('Payment not found');
      }

      if (payment.payment_status === 'success') {
        return new Response(
          JSON.stringify({ success: true, message: 'Payment already verified' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Mark as success
      await serviceClient
        .from('payments')
        .update({ payment_status: 'success' })
        .eq('id', paymentId);

      // Process payment items (same logic as verify-payment)
      const paymentItems = payment.payment_items || [];

      const articleIdsFromItems = (paymentItems as any[])
        .filter((i: any) => i.type === 'article_fee' && i.articleId)
        .map((i: any) => i.articleId);

      if (articleIdsFromItems.length > 0) {
        await serviceClient
          .from('articles')
          .update({ status: 'paid' })
          .in('id', articleIdsFromItems);
        console.log('Articles updated to paid:', articleIdsFromItems.length);
      }

      // Process Pro subscription
      const hasSubscription = (paymentItems as any[]).some((i: any) => i.type === 'pro_subscription');
      if (hasSubscription) {
        await serviceClient
          .from('user_subscriptions')
          .update({ is_active: false })
          .eq('user_id', payment.user_id)
          .eq('is_active', true);

        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await serviceClient
          .from('user_subscriptions')
          .insert({
            user_id: payment.user_id,
            plan_type: 'pro',
            starts_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            is_active: true,
            payment_id: paymentId,
          });
      }

      // Process co-author certificates
      const coauthorCerts = (paymentItems as any[]).filter((i: any) => i.type === 'coauthor_certificate');
      for (const cert of coauthorCerts) {
        if (!cert.coAuthorId || !cert.articleId) continue;
        try {
          await fetch(`${supabaseUrl}/functions/v1/generate-free-coauthor-cert`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              coAuthorId: cert.coAuthorId,
              articleId: cert.articleId,
              userId: payment.user_id,
              paidViaCart: true,
            }),
          });
        } catch (certError) {
          console.error('Failed to generate co-author certificate:', certError);
        }
      }

      // Process DOI purchases
      const doiItems = (paymentItems as any[]).filter((i: any) => i.type === 'doi' && i.articleId);
      for (const it of doiItems) {
        await serviceClient
          .from('articles')
          .update({ doi_requested: true, doi_paid: true, doi_paid_at: new Date().toISOString() })
          .eq('id', it.articleId);
      }

      const legacyDoiItems = (paymentItems as any[]).filter((i: any) => i.type === 'legacy_doi' && i.requestId);
      for (const it of legacyDoiItems) {
        await serviceClient
          .from('legacy_doi_requests')
          .update({
            status: 'paid',
            payment_id: paymentId,
            paid_at: new Date().toISOString(),
            amount: payment.final_amount,
            currency: payment.currency,
            updated_at: new Date().toISOString(),
          })
          .eq('id', it.requestId)
          .eq('user_id', payment.user_id);
      }

      // Update discount code usage
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

      // Notify author
      await serviceClient
        .from('notifications')
        .insert({
          user_id: payment.user_id,
          title: 'USDT Payment Verified! ✅',
          message: 'Your USDT payment has been verified and processed successfully.',
          type: 'success',
          link: '/author/articles',
        });

      // Notify every admin
      try {
        const { data: admins } = await serviceClient
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');
        if (admins && admins.length > 0) {
          const rows = admins.map((a: any) => ({
            user_id: a.user_id,
            title: 'USDT Payment Received 💰',
            message: `USDT payment of ${payment.final_amount} verified for user ${payment.user_id.slice(0, 8)}…`,
            type: 'success',
            link: '/admin/usdt-payments',
          }));
          await serviceClient.from('notifications').insert(rows);
        }
      } catch (e) {
        console.error('Failed to insert admin USDT notifications:', e);
      }


      // Send email confirmations
      const { data: userProfile } = await serviceClient
        .from('profiles')
        .select('full_name, email')
        .eq('id', payment.user_id)
        .single();

      const emailData = {
        paymentId: payment.id,
        amount: payment.amount,
        currency: 'USDT',
        finalAmount: payment.final_amount,
        discountCode: payment.discount_code,
        discountAmount: payment.discount_amount,
        transactionId: payment.transaction_id,
        paymentDate: new Date().toLocaleDateString(),
        authorName: userProfile?.full_name || 'Author',
        authorEmail: userProfile?.email,
        articleTitles: ['USDT Payment'],
      };

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
      } catch (e) {
        console.error('Email error:', e);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'USDT payment verified and processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: admin_reject — admin rejects the payment
    if (action === 'admin_reject') {
      const { data: roleData } = await serviceClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .single();

      if (!roleData) throw new Error('Admin access required');

      await serviceClient
        .from('payments')
        .update({ payment_status: 'failed' })
        .eq('id', paymentId);

      const { data: payment } = await serviceClient
        .from('payments')
        .select('user_id')
        .eq('id', paymentId)
        .single();

      if (payment) {
        await serviceClient
          .from('notifications')
          .insert({
            user_id: payment.user_id,
            title: 'USDT Payment Rejected ❌',
            message: 'Your USDT payment could not be verified. Please contact support or try again.',
            type: 'error',
            link: '/author/cart',
          });
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Payment rejected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in verify-binance-payment:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
