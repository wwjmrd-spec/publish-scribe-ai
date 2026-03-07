import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useMauticTracking, useMauticSync } from '@/hooks/useMautic';
import { useAuth } from '@/contexts/AuthContext';

const ROUTE_TAG_MAP: Record<string, string> = {
  '/': 'visited-homepage',
  '/auth': 'visited-auth',
  '/author': 'visited-dashboard',
  '/author/submit': 'visited-submit-article',
  '/author/resubmit': 'visited-resubmit-article',
  '/author/articles': 'visited-my-articles',
  '/author/cart': 'visited-cart',
  '/author/certificates': 'visited-certificates',
  '/author/profile': 'visited-profile',
  '/author/subscription': 'visited-subscription',
  '/author/rewards': 'visited-rewards',
};

export function MauticTrackingProvider({ children }: { children: React.ReactNode }) {
  useMauticTracking();

  const location = useLocation();
  const { user } = useAuth();
  const { syncContact, trackEvent } = useMauticSync();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    const path = location.pathname;

    // Avoid duplicate tracking for same path
    if (path === lastTrackedPath.current) return;
    lastTrackedPath.current = path;

    const tag = ROUTE_TAG_MAP[path];
    if (!tag) return;

    // Add the page tag to the contact
    syncContact({ email: user.email, tags: [tag] });

    // Also track as an event/note
    trackEvent(user.email, tag, { path, timestamp: new Date().toISOString() });
  }, [location.pathname, user?.email]);

  return <>{children}</>;
}
