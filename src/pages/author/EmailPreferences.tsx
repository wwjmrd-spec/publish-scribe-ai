import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Mail } from 'lucide-react';

const CATEGORIES: { key: keyof Prefs; label: string; description: string }[] = [
  { key: 'fee_reminder_enabled', label: 'Publication fee reminders', description: 'Reminders to complete pending publication fee payments.' },
  { key: 'revision_requested_enabled', label: 'Manuscript revision reminders', description: 'Nudges when your manuscript needs revisions.' },
  { key: 'marketing_enabled', label: 'Promotions & offers', description: 'Discount codes and promotional updates.' },
  { key: 'announcements_enabled', label: 'Product announcements', description: 'New features and platform updates.' },
];

type Prefs = {
  fee_reminder_enabled: boolean;
  revision_requested_enabled: boolean;
  marketing_enabled: boolean;
  announcements_enabled: boolean;
};

export default function EmailPreferences() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('email_preferences')
        .select('fee_reminder_enabled, revision_requested_enabled, marketing_enabled, announcements_enabled, email')
        .eq('author_id', user.id)
        .maybeSingle();
      if (!data) {
        // create a default row
        await supabase.from('email_preferences').insert({
          author_id: user.id,
          email: user.email || '',
        });
        setPrefs({
          fee_reminder_enabled: true,
          revision_requested_enabled: true,
          marketing_enabled: true,
          announcements_enabled: true,
        });
      } else {
        setPrefs(data as any);
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const toggle = (k: keyof Prefs) => setPrefs(p => p ? { ...p, [k]: !p[k] } : p);

  const save = async () => {
    if (!prefs || !user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('email_preferences')
      .update(prefs)
      .eq('author_id', user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    // audit log — one entry per category so admin can see it
    const rows = CATEGORIES.map(c => ({
      author_id: user.id,
      email: user.email || null,
      category: c.key.replace('_enabled', ''),
      action: prefs[c.key] ? 'subscribed' : 'unsubscribed',
      source: 'dashboard',
      actor_id: user.id,
    }));
    await supabase.from('email_preference_audit').insert(rows);
    toast.success('Email preferences saved.');
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          <h1 className="font-display text-2xl font-semibold">Email Preferences</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose which email categories you want to receive from WWJMRD. You can also unsubscribe from any
          reminder email directly via the link in its footer.
        </p>

        {loading && <div className="py-10 flex justify-center"><GlassSpinner /></div>}

        {!loading && prefs && (
          <GlassCard>
            <div className="space-y-4">
              {CATEGORIES.map(c => (
                <div key={c.key} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-[hsl(var(--glass-bg))]">
                  <div>
                    <p className="font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                  </div>
                  <Switch checked={!!prefs[c.key]} onCheckedChange={() => toggle(c.key)} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</Button>
            </div>
          </GlassCard>
        )}
      </div>
    </DashboardLayout>
  );
}
