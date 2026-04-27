import React, { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Send, Bell, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

type Audience =
  | 'all'
  | 'pro'
  | 'new_signups'
  | 'new_submitters'
  | 'no_articles'
  | 'specific';

export default function AdminNotifications() {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [windowDays, setWindowDays] = useState(7);
  const [specificUserId, setSpecificUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  // Fetch all author profiles + supporting data
  const { data: authorsData, isLoading: loadingAuthors } = useQuery({
    queryKey: ['admin-notif-authors'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'author');
      const authorIds = (roles || []).map((r) => r.user_id);
      if (authorIds.length === 0) return { profiles: [], subs: [], articles: [] };

      const [{ data: profiles }, { data: subs }, { data: articles }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, created_at').in('id', authorIds),
        supabase
          .from('user_subscriptions')
          .select('user_id, plan_type, is_active, expires_at')
          .in('user_id', authorIds)
          .eq('is_active', true),
        supabase.from('articles').select('author_id, created_at').in('author_id', authorIds),
      ]);

      return { profiles: profiles || [], subs: subs || [], articles: articles || [] };
    },
  });

  const targetIds = useMemo(() => {
    if (!authorsData) return [] as string[];
    const { profiles, subs, articles } = authorsData;
    const now = Date.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;

    if (audience === 'specific') {
      return specificUserId.trim() ? [specificUserId.trim()] : [];
    }
    if (audience === 'all') return profiles.map((p) => p.id);

    if (audience === 'pro') {
      const proIds = new Set(
        subs
          .filter(
            (s) =>
              s.plan_type !== 'free' &&
              (!s.expires_at || new Date(s.expires_at).getTime() > now)
          )
          .map((s) => s.user_id)
      );
      return profiles.filter((p) => proIds.has(p.id)).map((p) => p.id);
    }

    if (audience === 'new_signups') {
      return profiles
        .filter((p) => p.created_at && now - new Date(p.created_at).getTime() <= windowMs)
        .map((p) => p.id);
    }

    if (audience === 'new_submitters') {
      const recent = new Set(
        articles
          .filter((a) => a.created_at && now - new Date(a.created_at).getTime() <= windowMs)
          .map((a) => a.author_id)
      );
      return profiles.filter((p) => recent.has(p.id)).map((p) => p.id);
    }

    if (audience === 'no_articles') {
      const submitters = new Set(articles.map((a) => a.author_id));
      return profiles.filter((p) => !submitters.has(p.id)).map((p) => p.id);
    }
    return [];
  }, [authorsData, audience, windowDays, specificUserId]);

  const handleSendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in title and message.', variant: 'destructive' });
      return;
    }
    if (targetIds.length === 0) {
      toast({ title: 'No recipients', description: 'No users match the selected audience.', variant: 'destructive' });
      return;
    }

    setSending(true);
    setSentCount(null);

    try {
      const notifications = targetIds.map((uid) => ({
        user_id: uid,
        title: title.trim(),
        message: message.trim(),
        type,
        link: link.trim() || null,
      }));

      let totalInserted = 0;
      for (let i = 0; i < notifications.length; i += 100) {
        const batch = notifications.slice(i, i + 100);
        const { error } = await supabase.from('notifications').insert(batch);
        if (error) throw error;
        totalInserted += batch.length;
      }

      setSentCount(totalInserted);
      setTitle('');
      setMessage('');
      setLink('');
      setType('info');

      toast({
        title: 'Notifications sent!',
        description: `Successfully notified ${totalInserted} user${totalInserted > 1 ? 's' : ''}.`,
      });
    } catch (err) {
      console.error('Failed to send notifications:', err);
      toast({
        title: 'Failed to send',
        description: 'An error occurred while sending notifications.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const { data: recentBroadcasts } = useQuery({
    queryKey: ['admin-recent-broadcasts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('title, message, type, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!data) return [];
      const groups: Record<string, { title: string; message: string; type: string; created_at: string; count: number }> = {};
      for (const n of data) {
        const key = `${n.title}|${n.message}|${n.created_at.slice(0, 16)}`;
        if (!groups[key]) groups[key] = { ...n, count: 1 };
        else groups[key].count++;
      }
      return Object.values(groups).filter((g) => g.count > 1).slice(0, 10);
    },
  });

  const showWindow = audience === 'new_signups' || audience === 'new_submitters';

  return (
    <DashboardLayout type="admin">
      <div className="max-w-3xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold font-display mb-1">Broadcast Notifications</h1>
          <p className="text-muted-foreground text-sm">Send targeted announcements to specific author groups.</p>
        </motion.div>

        <GlassCard className="p-6 space-y-5">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Send className="w-5 h-5" />
            <span className="font-semibold">Compose Notification</span>
          </div>

          <div className="space-y-2">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">👥 All authors</SelectItem>
                <SelectItem value="pro">⭐ Pro members</SelectItem>
                <SelectItem value="new_signups">🆕 New signups</SelectItem>
                <SelectItem value="new_submitters">📄 New article submitters</SelectItem>
                <SelectItem value="no_articles">🕊️ Authors with no submissions</SelectItem>
                <SelectItem value="specific">🎯 Specific user (by ID)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showWindow && (
            <div className="space-y-2">
              <Label htmlFor="window-days">Within last (days)</Label>
              <Input
                id="window-days"
                type="number"
                min={1}
                max={365}
                value={windowDays}
                onChange={(e) => setWindowDays(Math.max(1, parseInt(e.target.value) || 7))}
                className="bg-muted/50"
              />
            </div>
          )}

          {audience === 'specific' && (
            <div className="space-y-2">
              <Label htmlFor="specific-user">User ID</Label>
              <Input
                id="specific-user"
                placeholder="uuid of the user"
                value={specificUserId}
                onChange={(e) => setSpecificUserId(e.target.value)}
                className="bg-muted/50"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notif-title">Title</Label>
            <Input
              id="notif-title"
              placeholder="e.g. New Feature Announcement 🎉"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-muted/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-message">Message</Label>
            <Textarea
              id="notif-message"
              placeholder="Write your notification message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="bg-muted/50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">ℹ️ Info</SelectItem>
                  <SelectItem value="success">✅ Success</SelectItem>
                  <SelectItem value="warning">⚠️ Warning</SelectItem>
                  <SelectItem value="reward">🎁 Reward</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notif-link">Link (optional)</Label>
              <Input
                id="notif-link"
                placeholder="/author/articles"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="bg-muted/50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              {loadingAuthors ? (
                <span>Loading audience...</span>
              ) : (
                <span>{targetIds.length} recipient{targetIds.length === 1 ? '' : 's'} match</span>
              )}
            </div>

            <Button onClick={handleSendNotification} disabled={sending || loadingAuthors || targetIds.length === 0}>
              {sending ? (
                <GlassSpinner size="sm" />
              ) : (
                <>
                  <Bell className="w-4 h-4 mr-2" />
                  Send Notification
                </>
              )}
            </Button>
          </div>

          {sentCount !== null && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-sm"
            >
              <CheckCircle className="w-4 h-4" />
              Successfully sent {sentCount} notifications!
            </motion.div>
          )}
        </GlassCard>

        {recentBroadcasts && recentBroadcasts.length > 0 && (
          <GlassCard className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              Recent Broadcasts
            </h2>
            <div className="space-y-3">
              {recentBroadcasts.map((b, i) => (
                <div key={i} className="flex items-start justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium text-sm">{b.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{b.message}</p>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                    {new Date(b.created_at).toLocaleDateString()} · {b.count} sent
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </DashboardLayout>
  );
}
