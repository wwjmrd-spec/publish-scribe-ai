import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bell, Save, Clock, CalendarDays, Mail, Send, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PROVIDERS = [
  { value: 'default', label: 'Use system default (Settings → Email)' },
  { value: 'resend', label: 'Resend' },
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'mailgun', label: 'Mailgun' },
  { value: 'aws-ses', label: 'AWS SES' },
];

export default function AdminReminderSettings() {
  const queryClient = useQueryClient();
  const [frequencyHours, setFrequencyHours] = useState<number>(24);
  const [minAge, setMinAge] = useState<number>(0);
  const [maxAge, setMaxAge] = useState<number>(30);
  const [provider, setProvider] = useState<string>('default');
  const [fromAddress, setFromAddress] = useState<string>('');
  const [infoAfter, setInfoAfter] = useState<number>(0);
  const [moderateAfter, setModerateAfter] = useState<number>(3);
  const [highAfter, setHighAfter] = useState<number>(6);
  const [deadline, setDeadline] = useState<string>('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['reminder-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminder_settings' as any).select('*').limit(1).single();
      if (error) throw error;
      return data as any;
    },
  });

  React.useEffect(() => {
    if (settings) {
      setFrequencyHours(settings.frequency_hours ?? 24);
      setMinAge(settings.min_article_age_days ?? 0);
      setMaxAge(settings.max_article_age_days ?? 30);
      setProvider(settings.email_provider_override || 'default');
      setFromAddress(settings.email_from_override || '');
      setInfoAfter(settings.urgency_informational_after_days ?? 0);
      setModerateAfter(settings.urgency_moderate_after_days ?? 3);
      setHighAfter(settings.urgency_high_after_days ?? 6);
      setDeadline(settings.last_fee_submission_date || '');
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('reminder_settings' as any)
        .update({
          frequency_hours: frequencyHours,
          min_article_age_days: minAge,
          max_article_age_days: maxAge,
          email_provider_override: provider === 'default' ? null : provider,
          email_from_override: fromAddress.trim() || null,
          urgency_informational_after_days: infoAfter,
          urgency_moderate_after_days: moderateAfter,
          urgency_high_after_days: highAfter,
          last_fee_submission_date: deadline || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-settings'] });
      toast.success('Reminder settings updated');
    },
    onError: (e: any) => toast.error('Failed to update: ' + e.message),
  });

  const sendNowMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-payment-reminder', { body: { all: true, force: true } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sent ${data?.remindersSent ?? 0} reminder(s)${data?.providerUsed ? ' via ' + data.providerUsed : ''}`);
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  if (isLoading) {
    return (
      <DashboardLayout type="admin">
        <div className="flex items-center justify-center h-64"><GlassSpinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Payment Reminder Settings</h1>
          <p className="text-muted-foreground">Configure when and how payment reminders are sent.</p>
        </div>

        <div className="max-w-xl">
          <GlassCard>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-display text-xl font-semibold">Reminder Configuration</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> Sending Frequency (hours)</Label>
                <Input type="number" min={1} max={168} value={frequencyHours} onChange={(e) => setFrequencyHours(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">How often a reminder email is sent. Default: 24 hours.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground" /> Min article age (days)</Label>
                  <Input type="number" min={0} max={365} value={minAge} onChange={(e) => setMinAge(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">Start reminding after the article has been pending for at least this many days.</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground" /> Max article age (days)</Label>
                  <Input type="number" min={1} max={3650} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">Stop reminding once the article has been pending more than this many days.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> Email server</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Reminders will be sent via this provider. Matches the providers from Settings → Email.</p>
              </div>

              <div className="space-y-2">
                <Label>From address override (optional)</Label>
                <Input placeholder="WWJMRD <noreply@wwjmrdai.online>" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} />
                <p className="text-xs text-muted-foreground">Leave blank to use the default from-address.</p>
              </div>

              <div className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))]">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Behavior:</strong> Reminder every{' '}
                  <strong className="text-primary">{frequencyHours}h</strong>, for articles pending between{' '}
                  <strong className="text-primary">{minAge}</strong> and <strong className="text-primary">{maxAge}</strong> days, sent via{' '}
                  <strong className="text-primary">{provider === 'default' ? 'system default' : provider}</strong>.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="flex-1">
                  <Save className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
                </Button>
                <Button variant="outline" onClick={() => sendNowMutation.mutate()} disabled={sendNowMutation.isPending}>
                  <Send className="w-4 h-4 mr-2" />
                  {sendNowMutation.isPending ? 'Sending…' : 'Send reminders now'}
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
