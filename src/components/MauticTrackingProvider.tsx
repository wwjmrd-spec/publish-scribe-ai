import { useMauticTracking } from '@/hooks/useMautic';

export function MauticTrackingProvider({ children }: { children: React.ReactNode }) {
  useMauticTracking();
  return <>{children}</>;
}
