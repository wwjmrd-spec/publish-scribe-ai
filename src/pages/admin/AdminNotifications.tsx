import React, { useState } from 'react';
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

export default function AdminNotifications() {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  // Fetch all author profiles
  const { data: authors, isLoading: loadingAuthors } = useQuery({
    queryKey: ['admin-all-authors'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'author');

      if (!roles || roles.length === 0) return [];

      const authorIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', authorIds);

      return profiles || [];
    },
  });

  const handleSendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in title and message.', variant: 'destructive' });
      return;
    }

    if (!authors || authors.length === 0) {
      toast({ title: 'No authors found', description: 'There are no authors to notify.', variant: 'destructive' });
      return;
    }

    setSending(true);
    setSentCount(null);

    try {
      const notifications = authors.map((author) => ({
        user_id: author.id,
        title: title.trim(),
        message: message.trim(),
        type,
        link: link.trim() || null,
      }));

      // Insert in batches of 100
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
        description: `Successfully notified ${totalInserted} authors.`,
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

  // Fetch recent broadcast history
  const { data: recentBroadcasts } = useQuery({
    queryKey: ['admin-recent-broadcasts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('title, message, type, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!data) return [];

      // Group by title+message+approximate time to find broadcasts
      const groups: Record<string, { title: string; message: string; type: string; created_at: string; count: number }> = {};
      for (const n of data) {
        const key = `${n.title}|${n.message}|${n.created_at.slice(0, 16)}`;
        if (!groups[key]) {
          groups[key] = { ...n, count: 1 };
        } else {
          groups[key].count++;
        }
      }

      return Object.values(groups)
        .filter((g) => g.count > 1)
        .slice(0, 10);
    },
  });

  return (
    <DashboardLayout type="admin">
      <div className="max-w-3xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold font-display mb-1">Broadcast Notifications</h1>
          <p className="text-muted-foreground text-sm">
            Send announcements to all authors at once.
          </p>
        </motion.div>

        <GlassCard className="p-6 space-y-5">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Send className="w-5 h-5" />
            <span className="font-semibold">Compose Notification</span>
          </div>

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
                <span>Loading authors...</span>
              ) : (
                <span>{authors?.length || 0} authors will receive this</span>
              )}
            </div>

            <Button onClick={handleSendNotification} disabled={sending || loadingAuthors}>
              {sending ? (
                <GlassSpinner size="sm" />
              ) : (
                <>
                  <Bell className="w-4 h-4 mr-2" />
                  Send to All Authors
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

        {/* Recent Broadcasts */}
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
