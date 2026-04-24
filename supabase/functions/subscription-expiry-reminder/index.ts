import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Authenticate caller — must be the scheduler (service role) or an admin
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (token !== serviceRoleKey && token !== anonKey) {
      // Allow admin users invoking via their JWT
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const adminCheck = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await adminCheck
        .from('user_roles').select('role').eq('user_id', user.id).single();
      if (roleData?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Find Pro subscriptions expiring within 5 days that do NOT have auto_renew enabled
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: expiringSubs, error } = await serviceClient
      .from('user_subscriptions')
      .select('*, profiles:user_id(full_name, email)')
      .eq('is_active', true)
      .eq('plan_type', 'pro')
      .eq('auto_renew', false)
      .lte('expires_at', fiveDaysFromNow.toISOString())
      .gte('expires_at', today.toISOString());

    if (error) {
      console.error('Error fetching expiring subscriptions:', error);
      throw error;
    }

    console.log(`Found ${expiringSubs?.length || 0} expiring subscriptions (non-auto-renew)`);

    let notifiedCount = 0;

    for (const sub of expiringSubs || []) {
      const profile = sub.profiles as any;
      const expiresAt = new Date(sub.expires_at);
      const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      // Check if we already sent a reminder for this subscription today
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: existingNotif } = await serviceClient
        .from('notifications')
        .select('id')
        .eq('user_id', sub.user_id)
        .eq('type', 'warning')
        .gte('created_at', `${todayStr}T00:00:00Z`)
        .ilike('title', '%Pro Plan Expiring%')
        .maybeSingle();

      if (existingNotif) {
        console.log(`Already notified user ${sub.user_id} today, skipping`);
        continue;
      }

      // Create in-app notification
      await serviceClient
        .from('notifications')
        .insert({
          user_id: sub.user_id,
          title: `Pro Plan Expiring Soon ⚠️`,
          message: `Your Pro subscription expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} on ${expiresAt.toLocaleDateString()}. Renew now to keep your benefits, or enable auto-pay to never miss a renewal!`,
          type: 'warning',
          link: '/author/subscription',
        });

      // Send email reminder
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            to: profile?.email,
            subject: `Your Pro Plan expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}!`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">Pro Plan Expiring Soon ⚠️</h2>
                <p>Hi ${profile?.full_name || 'Author'},</p>
                <p>Your <strong>Pro Plan subscription</strong> expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong> on <strong>${expiresAt.toLocaleDateString()}</strong>.</p>
                <p>Don't lose access to:</p>
                <ul>
                  <li>5 review report downloads per month</li>
                  <li>4 co-author certificates per month</li>
                </ul>
                <p>Visit your subscription page to renew or enable auto-pay!</p>
                <p style="color: #666; font-size: 14px;">If you have any questions, contact us at support@wwjmrd.com</p>
              </div>
            `,
          }),
        });
      } catch (emailError) {
        console.error(`Failed to send expiry email to ${profile?.email}:`, emailError);
      }

      notifiedCount++;
    }

    console.log(`Sent ${notifiedCount} expiry reminders`);

    return new Response(
      JSON.stringify({ success: true, notified: notifiedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Subscription expiry reminder error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
