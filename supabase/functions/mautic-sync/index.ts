import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface MauticTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getMauticConfig() {
  let baseUrl = Deno.env.get('VITE_MAUTIC_BASE_URL') || '';
  // Strip any trailing path like /s/login — we only need the root URL
  const pathMatch = baseUrl.match(/^(https?:\/\/[^/]+)/);
  if (pathMatch) baseUrl = pathMatch[1];
  const clientId = Deno.env.get('MAUTIC_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('MAUTIC_CLIENT_SECRET') || '';
  return { baseUrl, clientId, clientSecret };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const { baseUrl, clientId, clientSecret } = getMauticConfig();
  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error('Mautic not configured');
  }

  const response = await fetch(`${baseUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const text = await response.text();
  
  if (!response.ok) {
    console.error('Mautic OAuth response:', response.status, text.substring(0, 500));
    throw new Error(`Mautic OAuth failed: ${response.status}`);
  }

  // Guard against HTML responses (redirects to login pages)
  if (text.trimStart().startsWith('<')) {
    console.error('Mautic OAuth returned HTML instead of JSON:', text.substring(0, 300));
    throw new Error('Mautic OAuth returned HTML — check VITE_MAUTIC_BASE_URL');
  }

  const data: MauticTokenResponse = JSON.parse(text);
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function mauticRequest(path: string, method: string, body?: unknown) {
  const { baseUrl } = getMauticConfig();
  const token = await getAccessToken();

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}/api/${path}`, options);
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`Mautic API error: ${response.status} ${text}`);
    throw new Error(`Mautic API error: ${response.status}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();
    console.log('Mautic sync action:', action);

    switch (action) {
      case 'sync_contact': {
        const { email, firstname, lastname, country, company, tags } = data;
        console.log('sync_contact called for:', email, 'tags:', tags);
        
        // Search for existing contact by email
        const searchResult = await mauticRequest(`contacts?search=email:${encodeURIComponent(email)}`, 'GET');
        const contacts = searchResult.contacts || {};
        const existingId = Object.keys(contacts)[0];

        const contactData: Record<string, unknown> = {
          email,
          firstname: firstname || '',
          lastname: lastname || '',
          country: country || '',
          company: company || '',
          tags: tags || [],
        };

        let result;
        if (existingId) {
          result = await mauticRequest(`contacts/${existingId}/edit`, 'PATCH', contactData);
        } else {
          result = await mauticRequest('contacts/new', 'POST', contactData);
        }

        return new Response(JSON.stringify({ success: true, contact: result.contact }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'track_event': {
        const { email, eventName, eventData } = data;
        
        const searchResult = await mauticRequest(`contacts?search=email:${encodeURIComponent(email)}`, 'GET');
        const contacts = searchResult.contacts || {};
        const contactId = Object.keys(contacts)[0];

        if (contactId) {
          await mauticRequest(`contacts/${contactId}/notes/new`, 'POST', {
            lead: contactId,
            type: 'general',
            text: `Event: ${eventName} | Data: ${JSON.stringify(eventData)}`,
          });

          const tagData = { tags: [eventName] };
          await mauticRequest(`contacts/${contactId}/edit`, 'PATCH', tagData);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_mautic_url': {
        const { baseUrl } = getMauticConfig();
        return new Response(JSON.stringify({ url: baseUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Mautic sync error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
