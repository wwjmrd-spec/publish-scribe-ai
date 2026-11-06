import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Background CRM calls must never surface errors (the CRM or backend can be briefly unavailable).
async function callMautic(body: Record<string, unknown>): Promise<any> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mautic-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// Initialize Mautic tracking script
let mauticInitialized = false;

async function initMauticTracking() {
  if (mauticInitialized) return;
  
  try {
    const data = await callMautic({ action: 'get_mautic_url', data: {} });

    if (data?.url) {
      const script = document.createElement('script');
      script.innerHTML = `
        (function(w,d,t,u,n,a,m){w['MauticTrackingObject']=n;
        w[n]=w[n]||function(){(w[n].q=w[n].q||[]).push(arguments)},a=d.createElement(t),
        m=d.getElementsByTagName(t)[0];a.async=1;a.src=u;m.parentNode.insertBefore(a,m)
        })(window,document,'script','${data.url}/mtc.js','mt');
        mt('send', 'pageview');
      `;
      document.head.appendChild(script);
      mauticInitialized = true;
    }
  } catch (err) {
    console.log('Mautic tracking init skipped');
  }
}

export function useMauticTracking() {
  useEffect(() => {
    initMauticTracking();
  }, []);
}

export function useMauticSync() {
  const syncContact = useCallback(async (contactData: {
    email: string;
    firstname?: string;
    lastname?: string;
    country?: string;
    company?: string;
    phone?: string;
    tags?: string[];
  }) => {
    try {
      await callMautic({ action: 'sync_contact', data: contactData });
    } catch (err) {
      /* ignore */
    }
  }, []);

  const trackEvent = useCallback(async (email: string, eventName: string, eventData?: Record<string, unknown>) => {
    try {
      await callMautic({ action: 'track_event', data: { email, eventName, eventData } });
    } catch (err) {
      /* ignore */
    }
  }, []);

  const addToSegment = useCallback(async (email: string, segmentName: string) => {
    try {
      await callMautic({ action: 'add_to_segment', data: { email, segmentName } });
    } catch (err) {
      /* ignore */
    }
  }, []);

  return { syncContact, trackEvent, addToSegment };
}
