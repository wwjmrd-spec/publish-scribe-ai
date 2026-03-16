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

type MauticApiError = Error & {
  status?: number;
  body?: string;
};

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
  const text = await response.text();

  if (!response.ok) {
    console.error(`Mautic API error: ${response.status} ${text}`);
    const err = new Error(`Mautic API error: ${response.status}`) as MauticApiError;
    err.status = response.status;
    err.body = text;
    throw err;
  }

  return text ? JSON.parse(text) : {};
}

function isDuplicateEmailError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const mauticError = error as MauticApiError;
  const body = mauticError.body?.toLowerCase() || '';
  return mauticError.status === 422 && body.includes('email') && body.includes('unique');
}

function buildContactPayload(
  data: {
    email: string;
    firstname?: string;
    lastname?: string;
    country?: string;
    company?: string;
    phone?: string;
    tags?: string[];
  },
  includeEmail: boolean,
) {
  const payload: Record<string, unknown> = {};

  if (includeEmail) {
    payload.email = data.email;
  }

  const firstname = data.firstname?.trim();
  const lastname = data.lastname?.trim();
  const country = data.country?.trim();
  const company = data.company?.trim();
  const phone = data.phone?.trim();
  const tags = Array.from(new Set((data.tags || []).filter(Boolean)));

  if (firstname) payload.firstname = firstname;
  if (lastname) payload.lastname = lastname;
  if (country) payload.country = country;
  if (company) payload.company = company;
  if (phone) payload.phone = phone;
  if (tags.length > 0) payload.tags = tags;

  return payload;
}

async function findContactByEmail(email: string) {
  const search = new URLSearchParams({ search: `email:${email}` }).toString();
  const searchResult = await mauticRequest(`contacts?${search}`, 'GET');
  const contacts = searchResult.contacts || {};
  const contactId = Object.keys(contacts)[0] || null;

  return {
    contactId,
    contact: contactId ? contacts[contactId] : null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();
    console.log('Mautic sync action:', action);

    // Auth: validate JWT for all actions except get_mautic_url (public/non-sensitive)
    if (action !== 'get_mautic_url') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    switch (action) {
      case 'sync_contact': {
        const { email, firstname, lastname, country, company, phone, tags } = data;
        console.log('sync_contact called for:', email, 'tags:', tags);

        const createPayload = buildContactPayload(
          { email, firstname, lastname, country, company, phone, tags },
          true,
        );
        const updatePayload = buildContactPayload(
          { email, firstname, lastname, country, company, phone, tags },
          false,
        );

        let result: any = null;

        try {
          const existingContact = await findContactByEmail(email);

          if (existingContact.contactId) {
            if (Object.keys(updatePayload).length > 0) {
              try {
                result = await mauticRequest(`contacts/${existingContact.contactId}/edit`, 'PATCH', updatePayload);
              } catch (error) {
                if (isDuplicateEmailError(error)) {
                  console.warn('Duplicate email returned while updating existing contact; treating sync as successful');
                  result = { contact: existingContact.contact };
                } else {
                  throw error;
                }
              }
            } else {
              result = { contact: existingContact.contact };
            }
          } else {
            try {
              result = await mauticRequest('contacts/new', 'POST', createPayload);
            } catch (error) {
              if (!isDuplicateEmailError(error)) {
                throw error;
              }

              console.warn('Duplicate email returned during create; retrying by looking up the existing contact');
              const retryContact = await findContactByEmail(email);

              if (!retryContact.contactId) {
                throw error;
              }

              if (Object.keys(updatePayload).length > 0) {
                try {
                  result = await mauticRequest(`contacts/${retryContact.contactId}/edit`, 'PATCH', updatePayload);
                } catch (retryError) {
                  if (isDuplicateEmailError(retryError)) {
                    console.warn('Duplicate email returned again on retry update; treating sync as successful');
                    result = { contact: retryContact.contact };
                  } else {
                    throw retryError;
                  }
                }
              } else {
                result = { contact: retryContact.contact };
              }
            }
          }
        } catch (searchError) {
          console.warn('Contact search/update flow failed; falling back to create', searchError);
          result = await mauticRequest('contacts/new', 'POST', createPayload);
        }

        return new Response(JSON.stringify({ success: true, contact: result?.contact ?? null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'track_event': {
        const { email, eventName, eventData } = data;
        
        try {
          const searchResult = await mauticRequest(`contacts?search=email:${encodeURIComponent(email)}`, 'GET');
          const contacts = searchResult.contacts || {};
          const contactId = Object.keys(contacts)[0];

          if (contactId) {
            try {
              await mauticRequest('notes/new', 'POST', {
                lead: contactId,
                type: 'general',
                text: `Event: ${eventName} | Data: ${JSON.stringify(eventData)}`,
              });
            } catch (noteErr) {
              console.warn('Failed to create note:', noteErr);
            }

            try {
              await mauticRequest(`contacts/${contactId}/edit`, 'PATCH', { tags: [eventName] });
            } catch (tagErr) {
              console.warn('Failed to add tag:', tagErr);
            }
          }
        } catch (searchErr) {
          console.warn('Track event search failed:', searchErr);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'add_to_segment': {
        const { email, segmentName } = data;
        console.log('add_to_segment called for:', email, 'segment:', segmentName);

        // Find contact by email
        const contactSearch = await mauticRequest(`contacts?search=email:${encodeURIComponent(email)}`, 'GET');
        const foundContacts = contactSearch.contacts || {};
        const contactId = Object.keys(foundContacts)[0];

        if (!contactId) {
          console.error('Contact not found for segment assignment:', email);
          return new Response(JSON.stringify({ success: false, error: 'Contact not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Search for segment by name
        const segmentSearch = await mauticRequest(`segments?search=${encodeURIComponent(segmentName)}`, 'GET');
        const segments = segmentSearch.lists || {};
        let segmentId: string | null = null;

        for (const [id, seg] of Object.entries(segments)) {
          if ((seg as any).name === segmentName) {
            segmentId = id;
            break;
          }
        }

        if (!segmentId) {
          // Create segment if it doesn't exist
          console.log('Creating segment:', segmentName);
          const newSegment = await mauticRequest('segments/new', 'POST', {
            name: segmentName,
            isPublished: true,
          });
          segmentId = newSegment.list?.id?.toString();
        }

        if (segmentId) {
          await mauticRequest(`segments/${segmentId}/contact/${contactId}/add`, 'POST');
          console.log('Added contact', contactId, 'to segment', segmentId);
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
