import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Initialize Mautic tracking script
let mauticInitialized = false;

async function initMauticTracking() {
  if (mauticInitialized) return;
  
  try {
    const { data } = await supabase.functions.invoke('mautic-sync', {
      body: { action: 'get_mautic_url', data: {} },
    });

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
    tags?: string[];
  }) => {
    try {
      await supabase.functions.invoke('mautic-sync', {
        body: { action: 'sync_contact', data: contactData },
      });
    } catch (err) {
      console.error('Mautic contact sync failed:', err);
    }
  }, []);

  const trackEvent = useCallback(async (email: string, eventName: string, eventData?: Record<string, unknown>) => {
    try {
      await supabase.functions.invoke('mautic-sync', {
        body: { action: 'track_event', data: { email, eventName, eventData } },
      });
    } catch (err) {
      console.error('Mautic event tracking failed:', err);
    }
  }, []);

  return { syncContact, trackEvent };
}
