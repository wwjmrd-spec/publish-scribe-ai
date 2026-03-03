import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MauticTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${baseUrl}/oauth/v2/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mautic OAuth token request failed [${response.status}]: ${errorText}`);
  }

  const data: MauticTokenResponse = await response.json();
  return data.access_token;
}

async function mauticApiCall(
  baseUrl: string,
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const url = `${baseUrl}/api/${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mautic API call failed [${response.status}] ${method} ${endpoint}: ${errorText}`);
  }
  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MAUTIC_BASE_URL = Deno.env.get('MAUTIC_BASE_URL');
    const MAUTIC_CLIENT_ID = Deno.env.get('MAUTIC_CLIENT_ID');
    const MAUTIC_CLIENT_SECRET = Deno.env.get('MAUTIC_CLIENT_SECRET');

    if (!MAUTIC_BASE_URL || !MAUTIC_CLIENT_ID || !MAUTIC_CLIENT_SECRET) {
      throw new Error('Mautic configuration is incomplete. Missing MAUTIC_BASE_URL, MAUTIC_CLIENT_ID, or MAUTIC_CLIENT_SECRET.');
    }

    // Validate JWT from authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, data } = await req.json();

    // Return tracking URL without needing OAuth token
    if (action === 'get_tracking_url') {
      return new Response(JSON.stringify({ success: true, trackingUrl: MAUTIC_BASE_URL }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getAccessToken(MAUTIC_BASE_URL, MAUTIC_CLIENT_ID, MAUTIC_CLIENT_SECRET);

    let result: unknown;

    switch (action) {
      case 'create_contact': {
        // Create or update a contact in Mautic
        const { email, firstname, lastname, country, company, tags, custom_fields } = data;
        
        // First check if contact exists by email
        const searchResult = await mauticApiCall(
          MAUTIC_BASE_URL, token, 'GET',
          `contacts?search=email:${encodeURIComponent(email)}&limit=1`
        ) as any;
        
        const contactData: Record<string, unknown> = {
          email,
          firstname: firstname || '',
          lastname: lastname || '',
          country: country || '',
          company: company || '',
          ...custom_fields,
        };

        const existingContacts = searchResult?.contacts ? Object.values(searchResult.contacts) : [];
        
        if (existingContacts.length > 0) {
          // Update existing contact
          const existingId = (existingContacts[0] as any).id;
          result = await mauticApiCall(
            MAUTIC_BASE_URL, token, 'PATCH',
            `contacts/${existingId}/edit`, contactData
          );
        } else {
          // Create new contact
          result = await mauticApiCall(
            MAUTIC_BASE_URL, token, 'POST',
            'contacts/new', contactData
          );
        }

        // Add tags if provided
        if (tags && Array.isArray(tags) && tags.length > 0) {
          const contactId = (result as any)?.contact?.id;
          if (contactId) {
            for (const tag of tags) {
              await mauticApiCall(
                MAUTIC_BASE_URL, token, 'POST',
                `contacts/${contactId}/tags/add`, { tags: [tag] }
              ).catch(err => console.error('Tag add error:', err));
            }
          }
        }
        break;
      }

      case 'submit_form': {
        // Submit a form in Mautic
        const { formId, formData } = data;
        result = await mauticApiCall(
          MAUTIC_BASE_URL, token, 'POST',
          `forms/${formId}/submissions/contact`, formData
        );
        break;
      }

      case 'add_to_segment': {
        // Add contact to a segment
        const { contactId, segmentId } = data;
        result = await mauticApiCall(
          MAUTIC_BASE_URL, token, 'POST',
          `segments/${segmentId}/contact/${contactId}/add`, {}
        );
        break;
      }

      case 'track_event': {
        // Create a page hit / UTM tracking event for a contact
        const { contactId, url, page_title } = data;
        // Using the contacts point endpoint to log activity
        result = await mauticApiCall(
          MAUTIC_BASE_URL, token, 'POST',
          `contacts/${contactId}/activity`, { points: 0, eventName: page_title || url }
        );
        break;
      }

      case 'send_email': {
        // Send a Mautic email to a specific contact
        const { emailId, contactId: cId } = data;
        result = await mauticApiCall(
          MAUTIC_BASE_URL, token, 'POST',
          `emails/${emailId}/contact/${cId}/send`, {}
        );
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Mautic sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
