import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

let scriptPromise: Promise<void> | undefined;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = undefined; script.remove(); reject(new Error('Security check unavailable')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function TurnstileSignup({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    let widget: string | undefined;
    setError(false);
    callback.current('');
    const start = async () => {
      try {
        const [{ data, error: configError }] = await Promise.all([
          supabase.functions.invoke('signup-guard', { method: 'GET' }), loadScript(),
        ]);
        if (disposed) return;
        if (configError || !data?.siteKey || !container.current || !window.turnstile) throw new Error('Unavailable');
        widget = window.turnstile.render(container.current, {
          sitekey: data.siteKey, action: data.action, theme: 'auto', size: 'flexible',
          callback: (token: string) => { setError(false); callback.current(token); },
          'expired-callback': () => callback.current(''),
          'error-callback': () => { callback.current(''); setError(true); },
        });
      } catch { if (!disposed) setError(true); }
    };
    void start();
    return () => { disposed = true; if (widget) window.turnstile?.remove(widget); };
  }, [resetKey]);
  return <div className="space-y-2">
    <div ref={container} className="min-h-[65px] w-full" aria-label="Signup security check" />
    {error && <p role="alert" className="text-sm text-destructive">The security check could not load. Please refresh and try again.</p>}
  </div>;
}