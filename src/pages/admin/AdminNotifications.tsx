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
import { Send, Bell, Users, CheckCircle, AlertCircle, Mail, MessageSquare, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';

type Audience =
  | 'all'
  | 'pro'
  | 'new_signups'
  | 'new_submitters'
  | 'no_articles'
  | 'specific';

type SendMethod = 'notification_only' | 'notification_and_email';

export default function AdminNotifications() {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [windowDays, setWindowDays] = useState(7);
  const [specificUserIds, setSpecificUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [sendMethod, setSendMethod] = useState<SendMethod>('notification_only');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ notifications: number; emailsSent: number; emailsFailed: number } | null>(null);

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
      return specificUserIds;
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
  }, [authorsData, audience, windowDays, specificUserIds]);

  const targetRecipients = useMemo(() => {
    if (!authorsData) return [];
    const idSet = new Set(targetIds);
    return authorsData.profiles
      .filter((p) => idSet.has(p.id))
      .map((p) => ({
        user_id: p.id,
        email: p.email,
        name: p.full_name,
      }));
  }, [authorsData, targetIds]);

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
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Ensure we have a recipient (user_id + email) for every targetId.
      // Fall back to fetching profiles for ids missing from the cached author list
      // (e.g. "specific user" audience, or non-author users).
      let recipients = targetRecipients;
      const haveIds = new Set(recipients.map((r) => r.user_id));
      const missingIds = targetIds.filter((id) => !haveIds.has(id));
      if (missingIds.length > 0) {
        const { data: extra } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', missingIds);
        if (extra && extra.length > 0) {
          recipients = [
            ...recipients,
            ...extra.map((p) => ({ user_id: p.id, email: p.email, name: p.full_name })),
          ];
        }
      }

      // Email addresses are resolved server-side from auth.users (sign-in email).
      // Client-side we only need a valid user_id per recipient.
      recipients = recipients.filter((r) => !!r.user_id);

      if (recipients.length === 0) {
        throw new Error('No valid recipients found.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-broadcast`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            message: message.trim(),
            type,
            link: link.trim() || null,
            recipients,
            send_email: sendMethod === 'notification_and_email',
          }),
        }
      );


      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send broadcast');
      }

      setResult({
        notifications: data.notifications_sent || 0,
        emailsSent: data.emails_sent || 0,
        emailsFailed: data.emails_failed || 0,
      });

      setTitle('');
      setMessage('');
      setLink('');
      setType('info');

      toast({
        title: 'Broadcast sent!',
        description: `Sent ${data.notifications_sent} notification${data.notifications_sent > 1 ? 's' : ''}${data.emails_sent > 0 ? ` and ${data.emails_sent} email${data.emails_sent > 1 ? 's' : ''}` : ''}.`,
      });
    } catch (err: any) {
      console.error('Failed to send broadcast:', err);
      toast({
        title: 'Failed to send',
        description: err?.message || 'An error occurred while sending.',
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
              <Label htmlFor="user-search">Search users (name, email, or ID)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="user-search"
                  placeholder="Type to search..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="bg-muted/50 pl-9"
                />
              </div>

              {/* Search results */}
              {userSearch.trim() && authorsData && (
                <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted/30">
                  {(() => {
                    const q = userSearch.trim().toLowerCase();
                    const matches = authorsData.profiles
                      .filter(
                        (p) =>
                          !specificUserIds.includes(p.id) &&
                          (p.id.toLowerCase().includes(q) ||
                            (p.email || '').toLowerCase().includes(q) ||
                            (p.full_name || '').toLowerCase().includes(q))
                      )
                      .slice(0, 20);
                    if (matches.length === 0) {
                      return (
                        <div className="p-3 text-xs text-muted-foreground">No users match.</div>
                      );
                    }
                    return matches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSpecificUserIds((prev) => [...prev, p.id]);
                          setUserSearch('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b border-border/50 last:border-0"
                      >
                        <div className="font-medium">{p.full_name || '(no name)'}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                        <div className="text-[10px] text-muted-foreground/70 font-mono">{p.id}</div>
                      </button>
                    ));
                  })()}
                </div>
              )}

              {/* Selected chips */}
              {specificUserIds.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {specificUserIds.map((id) => {
                    const p = authorsData?.profiles.find((x) => x.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 bg-primary/15 text-primary text-xs px-2 py-1 rounded-full"
                      >
                        <span className="truncate max-w-[180px]">
                          {p?.full_name || p?.email || id}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSpecificUserIds((prev) => prev.filter((x) => x !== id))
                          }
                          className="hover:bg-primary/20 rounded-full p-0.5"
                          aria-label="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
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

          <div className="space-y-2">
            <Label>Delivery Method</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSendMethod('notification_only')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md border transition-all text-sm ${
                  sendMethod === 'notification_only'
                    ? 'bg-primary/15 border-primary text-primary font-medium'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Notification only
              </button>
              <button
                type="button"
                onClick={() => setSendMethod('notification_and_email')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md border transition-all text-sm ${
                  sendMethod === 'notification_and_email'
                    ? 'bg-primary/15 border-primary text-primary font-medium'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <Mail className="w-4 h-4" />
                Notification + Email
              </button>
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
                  {sendMethod === 'notification_and_email' ? (
                    <Mail className="w-4 h-4 mr-2" />
                  ) : (
                    <Bell className="w-4 h-4 mr-2" />
                  )}
                  {sendMethod === 'notification_and_email' ? 'Send Notification + Email' : 'Send Notification'}
                </>
              )}
            </Button>
          </div>

          {result !== null && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-sm">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>
                  Sent {result.notifications} notification{result.notifications > 1 ? 's' : ''}
                  {result.emailsSent > 1 && ` and ${result.emailsSent} email${result.emailsSent > 1 ? 's' : ''}`}
                </span>
              </div>
              {result.emailsFailed > 1 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{result.emailsFailed} email{result.emailsFailed > 1 ? 's' : ''} failed to send</span>
                </div>
              )}
            </motion.div>
          )}
        </GlassCard>

        {recentBroadcasts && recentBroadcasts.length > 1 && (
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
