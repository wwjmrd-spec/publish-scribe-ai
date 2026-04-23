import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, Search, Mail, Calendar, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';

export default function AdminProSubscribers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-pro-subscribers'],
    queryFn: async () => {
      const { data: subs, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('plan_type', 'pro')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const userIds = (subs || []).map((s) => s.user_id);
      if (!userIds.length) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      return (subs || []).map((s) => ({
        ...s,
        profile: profileMap.get(s.user_id),
      }));
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s: any) =>
        s.profile?.full_name?.toLowerCase().includes(q) ||
        s.profile?.email?.toLowerCase().includes(q),
    );
  }, [data, search]);

  const activeCount = useMemo(
    () =>
      data?.filter(
        (s: any) => !s.expires_at || new Date(s.expires_at) > new Date(),
      ).length || 0,
    [data],
  );

  const autoRenewCount = useMemo(
    () => data?.filter((s: any) => s.auto_renew).length || 0,
    [data],
  );

  if (isLoading) {
    return (
      <DashboardLayout type="admin">
        <div className="flex items-center justify-center h-64">
          <GlassSpinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="admin">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-2">
          <Crown className="w-6 h-6 text-primary" /> Pro Subscribers
        </h1>
        <p className="text-muted-foreground">Active Pro plan members</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total Pro members</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Currently active</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-cyan-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{autoRenewCount}</p>
              <p className="text-sm text-muted-foreground">Auto-renewing</p>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 glass-input max-w-md"
        />
      </div>

      <GlassCard>
        {!filtered.length ? (
          <div className="text-center py-12">
            <Crown className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No Pro subscribers yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--glass-border))]">
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Member</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Started</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Expires</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Auto-renew</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: any) => {
                  const expired = s.expires_at && new Date(s.expires_at) <= new Date();
                  return (
                    <tr key={s.id} className="border-b border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-medium">{s.profile?.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {s.profile?.email || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-muted-foreground">
                        {new Date(s.starts_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-3">
                        {s.auto_renew ? (
                          <Badge className="bg-cyan-500/20 text-cyan-500 border-cyan-500/30">Yes</Badge>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Active</Badge>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/admin/authors/${s.user_id}`)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </DashboardLayout>
  );
}
