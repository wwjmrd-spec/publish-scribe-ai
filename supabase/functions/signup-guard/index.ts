import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const secret = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
const siteKey = Deno.env.get('TURNSTILE_SITE_KEY') || '';
const server = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(createHandler({
  siteKey,
  async verify(token) {
    if (!secret || !siteKey) throw new Error('Configuration unavailable');
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Verification unavailable');
    return await response.json();
  },
  async disposable(domains) {
    const { data, error } = await server.from('disposable_email_domains').select('domain').in('domain', domains).limit(1);
    if (error) throw new Error('Domain lookup unavailable');
    return (data?.length || 0) > 0;
  },
  async log(event) {
    const { error } = await server.from('signup_security_events').insert(event);
    if (error) throw new Error('Security logging unavailable');
  },
  async signup(input, redirect) {
    // One isolated anonymous auth client per request; never admin-create/auto-confirm public registrations.
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: redirect, data: { full_name: input.fullName, country: input.country, affiliation: input.affiliation } },
    });
    return { error: Boolean(error), confirmedSession: Boolean(data.session) };
  },
}, corsHeaders));