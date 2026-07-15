import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Mail, Search } from 'lucide-react';

export default function AdminEmailPreferences() {
  const [q, setQ] = useState('');

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['admin-email-preferences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_preferences')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: audit } = useQuery({
    queryKey: ['admin-email-preferences-audit'],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_preference_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const filtered = (prefs || []).filter((p: any) =>
    !q || (p.email || '').toLowerCase().includes(q.toLowerCase())
  );

  return (
    <DashboardLayout type="admin">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          <h1 className="font-display text-2xl font-semibold">Email Preferences</h1>
        </div>

        <GlassCard>
          <div className="mb-4 relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by email…"
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="py-10 flex justify-center"><GlassSpinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-white/10">
                    <th className="p-2">Email</th>
                    <th className="p-2">Fee Reminder</th>
                    <th className="p-2">Revision</th>
                    <th className="p-2">Marketing</th>
                    <th className="p-2">Announcements</th>
                    <th className="p-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p: any) => (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="p-2">{p.email}</td>
                      {(['fee_reminder_enabled','revision_requested_enabled','marketing_enabled','announcements_enabled'] as const).map(k => (
                        <td key={k} className="p-2">
                          <Badge className={p[k] ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                            {p[k] ? 'On' : 'Off'}
                          </Badge>
                        </td>
                      ))}
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(p.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No preferences yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="font-semibold mb-3">Recent activity</h2>
          <div className="space-y-2 text-sm">
            {(audit || []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded bg-[hsl(var(--glass-bg))]">
                <div>
                  <span className="font-medium">{a.email || a.author_id.slice(0, 8)}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{a.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={a.action === 'subscribed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                    {a.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{a.source}</span>
                  <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {(audit || []).length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
          </div>
        </GlassCard>
      </div>
    </DashboardLayout>
  );
}
