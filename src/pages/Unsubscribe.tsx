import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { CheckCircle2, XCircle, Mail } from 'lucide-react';

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) { setState('error'); setError('Missing token.'); return; }
      const { data, error } = await supabase.functions.invoke('email-unsubscribe', {
        body: { token, action: 'info' },
      });
      if (error || (data as any)?.error) {
        setState('error');
        setError((data as any)?.error || error?.message || 'Invalid unsubscribe link.');
        return;
      }
      setInfo(data);
      setState('ready');
    })();
  }, [token]);

  const apply = async (action: 'unsubscribe' | 'resubscribe') => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('email-unsubscribe', {
      body: { token, action },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      setError((data as any)?.error || error?.message || 'Something went wrong.');
      return;
    }
    setInfo({ ...info, enabled: action === 'resubscribe' });
    setState('done');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a]">
      <GlassCard className="max-w-lg w-full text-center">
        {state === 'loading' && <div className="py-10 flex justify-center"><GlassSpinner /></div>}

        {state === 'error' && (
          <>
            <XCircle className="w-12 h-12 mx-auto text-red-400 mb-3" />
            <h1 className="text-xl font-semibold mb-2">Link not valid</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        )}

        {state === 'ready' && info && (
          <>
            <Mail className="w-12 h-12 mx-auto text-primary mb-3" />
            <h1 className="text-xl font-semibold mb-2">Email preferences</h1>
            <p className="text-sm text-muted-foreground mb-4">
              {info.email ? <>Account: <span className="font-medium text-foreground">{info.email}</span></> : null}
            </p>
            <p className="text-sm mb-6">
              Category: <span className="font-medium">{info.categoryLabel}</span>
              <br/>Currently: <span className="font-medium">{info.enabled ? 'Subscribed' : 'Unsubscribed'}</span>
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              {info.enabled ? (
                <Button variant="destructive" onClick={() => apply('unsubscribe')} disabled={saving}>
                  {saving ? 'Saving…' : 'Unsubscribe'}
                </Button>
              ) : (
                <Button onClick={() => apply('resubscribe')} disabled={saving}>
                  {saving ? 'Saving…' : 'Resubscribe'}
                </Button>
              )}
              <Link to="/author/email-preferences"><Button variant="outline">Manage all preferences</Button></Link>
            </div>
          </>
        )}

        {state === 'done' && (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-400 mb-3" />
            <h1 className="text-xl font-semibold mb-2">
              {info?.enabled ? 'You are subscribed' : 'You have been unsubscribed'}
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              Category: <span className="font-medium">{info?.categoryLabel}</span>
            </p>
            <Link to="/"><Button variant="outline">Back to site</Button></Link>
          </>
        )}
      </GlassCard>
    </div>
  );
}
