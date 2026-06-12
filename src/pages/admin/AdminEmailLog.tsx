import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Mail, Search, AlertCircle, CheckCircle2, Filter, Clock, Repeat } from 'lucide-react';

interface EmailLogRow {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  template_name: string | null;
  email_type: string;
  status: string;
  error_message: string | null;
  related_article_id: string | null;
  metadata: any;
  sent_at: string;
}

export default function AdminEmailLog() {
  const [search, setSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const navigate = useNavigate();
  const { data: emails, isLoading } = useQuery({
    queryKey: ['admin-email-log'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('email_log')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as EmailLogRow[];
    },
  });

  // Pending = scheduled broadcasts whose scheduled_for is in the future and not yet sent.
  const { data: pendingBroadcasts } = useQuery({
    queryKey: ['admin-pending-broadcasts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('scheduled_broadcasts')
        .select('id, title, message, notification_type, link, recipients, scheduled_for, status, send_email, email_provider_override, email_from')
        .in('status', ['pending', 'queued', 'scheduled'])
        .order('scheduled_for', { ascending: true })
        .limit(100);
      if (error) return [] as any[];
      return data ?? [];
    },
  });

  const templates = useMemo(() => {
    const set = new Set<string>();
    emails?.forEach((e) => e.template_name && set.add(e.template_name));
    return Array.from(set).sort();
  }, [emails]);

  const filtered = useMemo(() => {
    return (emails || []).filter((e) => {
      if (templateFilter !== 'all' && e.template_name !== templateFilter) return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.recipient_email.toLowerCase().includes(q) ||
          e.subject.toLowerCase().includes(q) ||
          (e.recipient_name || '').toLowerCase().includes(q) ||
          (e.metadata?.referenceNumber || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [emails, search, templateFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = emails?.length || 0;
    const sent = emails?.filter((e) => e.status === 'sent').length || 0;
    const failed = emails?.filter((e) => e.status === 'failed').length || 0;
    const pending = (pendingBroadcasts?.length || 0);
    return { total, sent, failed, pending };
  }, [emails, pendingBroadcasts]);

  const reuse = (e: EmailLogRow) => {
    navigate('/admin/notifications', {
      state: {
        reuse: {
          title: e.subject,
          message: (e.metadata as any)?.message || '',
          type: 'info',
          extraEmails: e.recipient_email,
        },
      },
    });
  };

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
          <Mail className="w-6 h-6" /> Sent Emails
        </h1>
        <p className="text-muted-foreground">All outbound emails sent by the system</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total emails</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.sent}</p>
              <p className="text-sm text-muted-foreground">Sent successfully</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.failed}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, subject, name, or reference number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 glass-input"
          />
        </div>
        <Select value={templateFilter} onValueChange={setTemplateFilter}>
          <SelectTrigger className="w-full sm:w-56 glass-input">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All templates</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 glass-input">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <GlassCard>
        {!filtered.length ? (
          <div className="text-center py-12">
            <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No emails found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--glass-border))]">
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Sent</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Recipient</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Subject</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Template</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors">
                    <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.sent_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium">{e.recipient_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{e.recipient_email}</div>
                    </td>
                    <td className="py-3 px-3 max-w-[280px] truncate">{e.subject}</td>
                    <td className="py-3 px-3">
                      <Badge variant="outline" className="text-xs">{e.template_name || 'custom'}</Badge>
                    </td>
                    <td className="py-3 px-3">
                      {e.status === 'sent' ? (
                        <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Sent</Badge>
                      ) : (
                        <div>
                          <Badge variant="destructive">Failed</Badge>
                          {e.error_message && (
                            <div className="text-[10px] text-destructive mt-1 max-w-[200px] truncate" title={e.error_message}>
                              {e.error_message}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </DashboardLayout>
  );
}
