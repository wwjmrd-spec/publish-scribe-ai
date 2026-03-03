/**
 * Mautic Tracking Script Loader
 * Loads the mtc.js tracking script from the self-hosted Mautic instance.
 * The base URL is injected at runtime from env.
 */

const MAUTIC_BASE_URL = import.meta.env.VITE_MAUTIC_BASE_URL as string | undefined;

declare global {
  interface Window {
    mt?: (...args: unknown[]) => void;
    MauticTrackingObject?: string;
    MauticDomain?: string;
  }
}

let loaded = false;

export function loadMauticTracking() {
  if (loaded || !MAUTIC_BASE_URL) return;
  loaded = true;

  const baseUrl = MAUTIC_BASE_URL.replace(/\/$/, '');

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
}

/**
 * Send a custom Mautic tracking event (page or custom event).
 * Must be called after loadMauticTracking().
 */
export function trackMauticEvent(eventData: Record<string, string>) {
  if (typeof window.mt === 'function') {
    window.mt('send', 'pageview', eventData);
  }
}
