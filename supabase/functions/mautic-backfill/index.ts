import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getMauticConfig() {
  let baseUrl = Deno.env.get('MAUTIC_BASE_URL') || Deno.env.get('VITE_MAUTIC_BASE_URL') || '';
  const pathMatch = baseUrl.match(/^(https?:\/\/[^/]+)/);
  if (pathMatch) baseUrl = pathMatch[1];
  return {
    baseUrl,
    clientId: Deno.env.get('MAUTIC_CLIENT_ID') || '',
    clientSecret: Deno.env.get('MAUTIC_CLIENT_SECRET') || '',
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.token;
  const { baseUrl, clientId, clientSecret } = getMauticConfig();
  if (!baseUrl || !clientId || !clientSecret) throw new Error('Mautic not configured');

  const res = await fetch(`${baseUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mautic OAuth failed: ${res.status} ${text.substring(0, 200)}`);
  const data = JSON.parse(text);
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function mauticRequest(path: string, method: string, body?: unknown) {
  const { baseUrl } = getMauticConfig();
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl}/api/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mautic ${method} ${path} → ${res.status}: ${text.substring(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

async function findContactId(email: string): Promise<string | null> {
  const q = new URLSearchParams({ search: `email:${email}` }).toString();
  const r = await mauticRequest(`contacts?${q}`, 'GET');
  const contacts = r.contacts || {};
  return Object.keys(contacts)[0] || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // AuthZ: admin only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load all profiles + roles + articles
    const { data: profiles, error: pErr } = await supabase
      .from('profiles').select('id, email, full_name, country, affiliation');
    if (pErr) throw pErr;

    const { data: articles } = await supabase
      .from('articles').select('author_id, status');

    const statusByAuthor = new Map<string, Set<string>>();
    for (const a of articles || []) {
      if (!a.author_id || !a.status) continue;
      if (!statusByAuthor.has(a.author_id)) statusByAuthor.set(a.author_id, new Set());
      statusByAuthor.get(a.author_id)!.add(`article-status-${a.status}`);
    }

    const results: { email: string; ok: boolean; tags: number; error?: string }[] = [];
    let synced = 0, failed = 0;

    for (const p of profiles || []) {
      if (!p.email) continue;
      const tags = Array.from(statusByAuthor.get(p.id) || []);
      const [firstname, ...rest] = (p.full_name || '').split(' ');
      const lastname = rest.join(' ');

      const payload: Record<string, unknown> = {
        email: p.email,
        firstname: firstname || undefined,
        lastname: lastname || undefined,
        country: p.country || undefined,
        company: p.affiliation || undefined,
        tags: tags.length ? tags : undefined,
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      try {
        const existingId = await findContactId(p.email);
        if (existingId) {
          const { email: _e, ...updateBody } = payload as any;
          if (Object.keys(updateBody).length > 0) {
            await mauticRequest(`contacts/${existingId}/edit`, 'PATCH', updateBody);
          }
        } else {
          await mauticRequest('contacts/new', 'POST', payload);
        }
        synced++;
        results.push({ email: p.email, ok: true, tags: tags.length });
      } catch (e) {
        failed++;
        results.push({ email: p.email, ok: false, tags: tags.length, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: profiles?.length || 0,
      synced,
      failed,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('mautic-backfill error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
