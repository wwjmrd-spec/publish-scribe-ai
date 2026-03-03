/**
 * Mautic Tracking Script Loader
 * Loads the mtc.js tracking script from the self-hosted Mautic instance.
 * Fetches the Mautic base URL from the backend config.
 */

import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    mt?: (...args: unknown[]) => void;
    MauticTrackingObject?: string;
  }
}

let loaded = false;

export async function loadMauticTracking() {
  if (loaded) return;
  loaded = true;

  try {
    // Fetch Mautic base URL from the edge function
    const { data, error } = await supabase.functions.invoke('mautic-sync', {
      body: { action: 'get_tracking_url', data: {} },
    });

    if (error || !data?.trackingUrl) {
      console.log('Mautic tracking not configured');
      return;
    }

    const baseUrl = (data.trackingUrl as string).replace(/\/$/, '');

    // Standard Mautic tracking snippet
    window.MauticTrackingObject = 'mt';
    window.mt =
      window.mt ||
      function (...args: unknown[]) {
        // @ts-ignore
        (window.mt.q = window.mt.q || []).push(args);
      };

    const script = document.createElement('script');
    script.async = true;
    script.src = `${baseUrl}/mtc.js`;
    document.head.appendChild(script);
  } catch (err) {
    console.log('Mautic tracking load failed:', err);
  }
}

/**
 * Send a custom Mautic tracking event.
 */
export function trackMauticEvent(eventData: Record<string, string>) {
  if (typeof window.mt === 'function') {
    window.mt('send', 'pageview', eventData);
  }
}
