import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { MANUAL_ADMIN_STATUSES } from '@/lib/articleStatus';

type Audience =
  | 'all'
  | 'pro'
  | 'new_signups'
  | 'new_submitters'
  | 'no_articles'
  | 'article_status'
  | 'specific';

type SendMethod = 'notification_only' | 'notification_and_email';

export default function AdminNotifications() {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [windowDays, setWindowDays] = useState(7);
  const [specificUserIds, setSpecificUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [articleStatus, setArticleStatus] = useState<string>('submitted');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | 'INR' | 'USD'>('all');
  const [sendMethod, setSendMethod] = useState<SendMethod>('notification_only');
  const [emailProviderOverride, setEmailProviderOverride] = useState<string>('default');
  const [fromEmail, setFromEmail] = useState<string>('');
  const [includeCoAuthors, setIncludeCoAuthors] = useState(false);
  const [extraEmails, setExtraEmails] = useState<string>('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(''); // datetime-local value
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    notifications: number;
    emailsSent: number;
    emailsFailed: number;
    scheduled?: boolean;
    scheduledFor?: string;
    results?: Array<{ email: string; name?: string | null; kind: 'recipient' | 'coauthor' | 'extra'; status: 'sent' | 'failed'; error?: string }>;
  } | null>(null);

  // Prefill from "Reuse" navigation state.
  useEffect(() => {
    const reuse = (location.state as any)?.reuse;
    if (!reuse) return;
    if (reuse.title) setTitle(reuse.title);
    if (reuse.message) setMessage(reuse.message);
    if (reuse.type) setType(reuse.type);
    if (reuse.link) setLink(reuse.link);
    if (reuse.extraEmails) {
      setSendMethod('notification_and_email');
      setExtraEmails(reuse.extraEmails);
    }
    // Clear state so a reload doesn't re-apply.
    navigate(location.pathname, { replace: true, state: {} });
  }, [location, navigate]);

  // Fetch all author profiles + supporting data
  const { data: authorsData, isLoading: loadingAuthors } = useQuery({
    queryKey: ['admin-notif-authors'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');
      const authorIds = new Set(
        (roles || []).filter((r) => r.role === 'author').map((r) => r.user_id)
      );
      if (authorIds.size === 0) return { profiles: [], subs: [], articles: [] };

      // Fetch without .in() filters — the ID list is too long for the URL.
      // Filter client-side against the author set instead.
      const [{ data: profilesAll }, { data: subsAll }, { data: articlesAll }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, created_at, is_indian, country').limit(10000),
        supabase
          .from('user_subscriptions')
          .select('user_id, plan_type, is_active, expires_at')
          .eq('is_active', true)
          .limit(10000),
        supabase.from('articles').select('author_id, created_at, status').limit(20000),
      ]);

      const profiles = (profilesAll || []).filter((p) => authorIds.has(p.id));
      const subs = (subsAll || []).filter((s) => authorIds.has(s.user_id));
      const articles = (articlesAll || []).filter((a) => authorIds.has(a.author_id));

      return { profiles, subs, articles };
    },
  });

  const targetIds = useMemo(() => {
    if (!authorsData) return [] as string[];
    const { profiles, subs, articles } = authorsData;
    const now = Date.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;

    // Currency filter (top-level): keep only authors whose billing currency matches.
    const passesCurrency = (p: any) => {
      if (currencyFilter === 'all') return true;
      const cur = p.is_indian ? 'INR' : 'USD';
      return cur === currencyFilter;
    };

    let ids: string[] = [];

    if (audience === 'specific') {
      ids = specificUserIds;
    } else if (audience === 'all') {
      ids = profiles.filter(passesCurrency).map((p) => p.id);
    } else if (audience === 'pro') {
      const proIds = new Set(
        subs
          .filter((s) => s.plan_type !== 'free' && (!s.expires_at || new Date(s.expires_at).getTime() > now))
          .map((s) => s.user_id)
      );
      ids = profiles.filter((p) => proIds.has(p.id) && passesCurrency(p)).map((p) => p.id);
    } else if (audience === 'new_signups') {
      ids = profiles
        .filter((p) => p.created_at && now - new Date(p.created_at).getTime() <= windowMs && passesCurrency(p))
        .map((p) => p.id);
    } else if (audience === 'new_submitters') {
      const recent = new Set(
        articles
          .filter((a) => a.created_at && now - new Date(a.created_at).getTime() <= windowMs)
          .map((a) => a.author_id)
      );
      ids = profiles.filter((p) => recent.has(p.id) && passesCurrency(p)).map((p) => p.id);
    } else if (audience === 'no_articles') {
      const submitters = new Set(articles.map((a) => a.author_id));
      ids = profiles.filter((p) => !submitters.has(p.id) && passesCurrency(p)).map((p) => p.id);
    } else if (audience === 'article_status') {
      const matching = new Set(
        articles.filter((a) => a.status === articleStatus).map((a) => a.author_id)
      );
      ids = profiles.filter((p) => matching.has(p.id) && passesCurrency(p)).map((p) => p.id);
    }

    // For "specific", apply currency filter against profile lookup.
    if (audience === 'specific' && currencyFilter !== 'all') {
      const map = new Map(profiles.map((p) => [p.id, p]));
      ids = ids.filter((id) => {
        const p: any = map.get(id);
        return p ? passesCurrency(p) : true;
      });
    }

    return ids;
  }, [authorsData, audience, windowDays, specificUserIds, articleStatus, currencyFilter]);


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

  // Fetch co-author emails for the selected target authors (only when needed).
  const coAuthorsEnabled = sendMethod === 'notification_and_email' && includeCoAuthors && targetIds.length > 0;
  const { data: coAuthorEmails } = useQuery({
    queryKey: ['admin-notif-coauthors', targetIds.sort().join(',')],
    enabled: coAuthorsEnabled,
    queryFn: async () => {
      const { data: articles } = await supabase.from('articles').select('id, author_id').limit(20000);
      const idSet = new Set(targetIds);
      const articleIds = (articles || []).filter((a: any) => idSet.has(a.author_id)).map((a: any) => a.id);
      if (articleIds.length === 0) return [] as Array<{ email: string; name: string | null }>;
      // co_authors table has RLS scoped to article author/admin — as an admin, this returns all rows.
      const { data: cas } = await supabase.from('co_authors').select('email, name').in('article_id', articleIds).limit(20000);
      const recipientEmails = new Set(
        targetRecipients.map((r) => (r.email || '').trim().toLowerCase()).filter(Boolean),
      );
      const map = new Map<string, { email: string; name: string | null }>();
      for (const ca of cas || []) {
        const e = (ca.email || '').trim().toLowerCase();
        if (!e || !/.+@.+\..+/.test(e)) continue;
        if (recipientEmails.has(e)) continue;
        if (!map.has(e)) map.set(e, { email: ca.email, name: ca.name || null });
      }
      return Array.from(map.values());
    },
  });

  const extraEmailList = useMemo(() => {
    if (sendMethod !== 'notification_and_email') return [] as string[];
    return extraEmails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /.+@.+\..+/.test(s));
  }, [extraEmails, sendMethod]);


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

      // Scheduled send path: store the job; the cron worker will dispatch it later.
      if (scheduleEnabled) {
        if (!scheduleAt) throw new Error('Please choose a date and time.');
        const scheduledForIso = new Date(scheduleAt).toISOString();
        if (new Date(scheduledForIso).getTime() <= Date.now()) {
          throw new Error('Scheduled time must be in the future.');
        }
        const { data: sess } = await supabase.auth.getUser();
        const adminId = sess?.user?.id;
        if (!adminId) throw new Error('Not authenticated');

        const { error: insErr } = await supabase.from('scheduled_broadcasts').insert({
          title: title.trim(),
          message: message.trim(),
          notification_type: type,
          link: link.trim() || null,
          recipients,
          send_email: sendMethod === 'notification_and_email',
          email_provider_override:
            sendMethod === 'notification_and_email' && emailProviderOverride !== 'default'
              ? emailProviderOverride
              : null,
          email_from:
            sendMethod === 'notification_and_email' && fromEmail.trim() ? fromEmail.trim() : null,
          scheduled_for: scheduledForIso,
          created_by: adminId,
        });
        if (insErr) throw insErr;

        setResult({
          notifications: recipients.length,
          emailsSent: 0,
          emailsFailed: 0,
          scheduled: true,
          scheduledFor: scheduledForIso,
        });
        toast({
          title: 'Broadcast scheduled',
          description: `Will deliver to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'} at ${new Date(scheduledForIso).toLocaleString()}.`,
        });

        setTitle('');
        setMessage('');
        setLink('');
        setType('info');
        return;
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
            article_status_context: audience === 'article_status' ? articleStatus : undefined,
            send_email: sendMethod === 'notification_and_email',
            email_provider_override:
              sendMethod === 'notification_and_email' && emailProviderOverride !== 'default'
                ? emailProviderOverride
                : undefined,
            email_from:
              sendMethod === 'notification_and_email' && fromEmail.trim()
                ? fromEmail.trim()
                : undefined,
            include_coauthors: sendMethod === 'notification_and_email' && includeCoAuthors,
            extra_emails: sendMethod === 'notification_and_email'
              ? extraEmails.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s))
              : [],
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
      return Object.values(groups).slice(0, 10);
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
                <SelectItem value="article_status">📌 Authors by article status</SelectItem>
                <SelectItem value="specific">🎯 Specific user(s)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Currency / region filter</Label>
            <Select value={currencyFilter} onValueChange={(v) => setCurrencyFilter(v as 'all' | 'INR' | 'USD')}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌍 All currencies</SelectItem>
                <SelectItem value="INR">🇮🇳 INR (Indian authors)</SelectItem>
                <SelectItem value="USD">🌐 USD (International authors)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Filters recipients by their billing currency. Useful for fee-related broadcasts (e.g. pending fee in INR vs USD).
            </p>
          </div>



          {audience === 'article_status' && (
            <div className="space-y-2">
              <Label>Article status</Label>
              <Select value={articleStatus} onValueChange={setArticleStatus}>
                <SelectTrigger className="bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_ADMIN_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Recipients: {targetIds.length} author{targetIds.length === 1 ? '' : 's'} with at least one article in this status.
              </p>
            </div>
          )}

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
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Insert personalization tokens (replaced per recipient when sent):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  '{{author_name}}',
                  '{{author_email}}',
                  '{{author_country}}',
                  '{{currency}}',
                  '{{article_title}}',
                  '{{article_reference}}',
                  '{{article_status}}',
                  '{{page_count}}',
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setMessage((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${tag}`)}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 font-mono"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
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

          {sendMethod === 'notification_and_email' && (
            <div className="space-y-2">
              <Label>Send via email server</Label>
              <Select value={emailProviderOverride} onValueChange={setEmailProviderOverride}>
                <SelectTrigger className="bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (configured in Settings, with fallback)</SelectItem>
                  <SelectItem value="resend">Resend</SelectItem>
                  <SelectItem value="aws-ses">AWS SES</SelectItem>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="mailgun">Mailgun</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Override the server used for this broadcast. Default uses the primary provider plus configured backups.
              </p>

              <div className="space-y-2 pt-2">
                <Label>From email address (optional)</Label>
                <Input
                  placeholder='e.g. "WWJMRD <noreply@wwjmrd.com>" or noreply@wwjmrd.com'
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the provider's default sender. Address must be verified with the selected server (AWS SES requires verification in your region).
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeCoAuthors}
                    onChange={(e) => setIncludeCoAuthors(e.target.checked)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium">Also email co-authors</p>
                    <p className="text-xs text-muted-foreground">
                      Sends the email to every co-author listed on the recipients' articles (email only — no notification row).
                    </p>
                  </div>
                </label>
              </div>

              <div className="space-y-2 pt-2">
                <Label>Additional email addresses (optional)</Label>
                <Textarea
                  rows={2}
                  placeholder="comma or newline separated, e.g. editor@journal.com, board@journal.com"
                  value={extraEmails}
                  onChange={(e) => setExtraEmails(e.target.value)}
                  className="bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">
                  These addresses also receive the email. Useful for previously-provided contacts or external collaborators.
                </p>
              </div>
            </div>
          )}


          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <Label>Schedule for later</Label>
              <button
                type="button"
                onClick={() => setScheduleEnabled((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  scheduleEnabled
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {scheduleEnabled ? 'Scheduled' : 'Send immediately'}
              </button>
            </div>
            {scheduleEnabled && (
              <>
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="bg-muted/50"
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                />
                <p className="text-xs text-muted-foreground">
                  Stored in your local timezone and delivered to all recipients at that exact moment. The scheduler runs every 5 minutes.
                </p>
              </>
            )}
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
                  {scheduleEnabled
                    ? 'Schedule Broadcast'
                    : sendMethod === 'notification_and_email'
                      ? 'Send Notification + Email'
                      : 'Send Notification'}
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
                  {result.scheduled
                    ? `Scheduled ${result.notifications} broadcast${result.notifications === 1 ? '' : 's'} for ${result.scheduledFor ? new Date(result.scheduledFor).toLocaleString() : 'later'}.`
                    : `Sent ${result.notifications} notification${result.notifications === 1 ? '' : 's'}${result.emailsSent >= 1 ? ` and ${result.emailsSent} email${result.emailsSent === 1 ? '' : 's'}` : ''}`}
                </span>
              </div>

              {result.emailsFailed >= 1 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{result.emailsFailed} email{result.emailsFailed === 1 ? '' : 's'} failed to send</span>
                </div>
              )}
            </motion.div>
          )}
        </GlassCard>

        {recentBroadcasts && recentBroadcasts.length >= 1 && (
          <GlassCard className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              Recent Broadcasts — reuse for the same or new audience
            </h2>
            <div className="space-y-3">
              {recentBroadcasts.map((b, i) => (
                <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{b.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(b.created_at).toLocaleDateString()} · {b.count} sent
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTitle(b.title);
                        setMessage(b.message);
                        setType(b.type || 'info');
                        setResult(null);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        toast({ title: 'Loaded for reuse', description: 'Adjust audience and send again.' });
                      }}
                    >
                      Reuse
                    </Button>
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
