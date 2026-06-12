import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Search, Mail, Phone, Trash2, CheckCircle2, Reply } from 'lucide-react';

type Question = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

export default function AdminQuestions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-questions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contact_questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  const filtered = rows.filter((r) => {
    if (status !== 'all' && r.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    total: rows.length,
    new: rows.filter((r) => r.status === 'new').length,
    read: rows.filter((r) => r.status === 'read').length,
    resolved: rows.filter((r) => r.status === 'resolved').length,
  };

  const setStatusFor = async (id: string, newStatus: string) => {
    const { error } = await (supabase as any).from('contact_questions').update({ status: newStatus }).eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['admin-questions'] });
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    const { error } = await (supabase as any).from('contact_questions').delete().eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Deleted' });
    qc.invalidateQueries({ queryKey: ['admin-questions'] });
  };

  if (isLoading) {
    return (
      <DashboardLayout type="admin">
        <div className="flex items-center justify-center h-64"><GlassSpinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-2">
          <MessageSquare className="w-6 h-6" /> Contact Questions
        </h1>
        <p className="text-muted-foreground">Messages submitted through the public Contact Us form</p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <GlassCard><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></GlassCard>
        <GlassCard><p className="text-2xl font-bold text-primary">{stats.new}</p><p className="text-xs text-muted-foreground">New</p></GlassCard>
        <GlassCard><p className="text-2xl font-bold text-amber-500">{stats.read}</p><p className="text-xs text-muted-foreground">Read</p></GlassCard>
        <GlassCard><p className="text-2xl font-bold text-emerald-500">{stats.resolved}</p><p className="text-xs text-muted-foreground">Resolved</p></GlassCard>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 glass-input" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40 glass-input"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <GlassCard><p className="text-center py-12 text-muted-foreground">No messages found.</p></GlassCard>
        ) : filtered.map((r) => (
          <GlassCard key={r.id}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant={r.status === 'new' ? 'default' : r.status === 'resolved' ? 'outline' : 'secondary'}>
                    {r.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <h3 className="font-semibold">{r.subject}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>{r.name}</span>
                  <a href={`mailto:${r.email}`} className="flex items-center gap-1 hover:text-primary"><Mail className="w-3 h-3" />{r.email}</a>
                  {r.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {r.status !== 'resolved' && (
                  <Button size="sm" variant="outline" onClick={() => setStatusFor(r.id, 'resolved')}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Resolve
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <a href={`mailto:${r.email}?subject=Re: ${encodeURIComponent(r.subject)}`}><Reply className="w-3.5 h-3.5 mr-1" />Reply</a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div
              className={`mt-3 text-sm whitespace-pre-wrap ${expanded === r.id ? '' : 'line-clamp-3'} cursor-pointer`}
              onClick={() => {
                setExpanded(expanded === r.id ? null : r.id);
                if (r.status === 'new') setStatusFor(r.id, 'read');
              }}
            >
              {r.message}
            </div>
          </GlassCard>
        ))}
      </div>
    </DashboardLayout>
  );
}
