import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bell, Save, Clock, CalendarDays } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';

export default function AdminReminderSettings() {
  const queryClient = useQueryClient();
  const [frequencyHours, setFrequencyHours] = useState<number>(24);
  const [maxDays, setMaxDays] = useState<number>(2);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['reminder-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminder_settings' as any)
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  React.useEffect(() => {
    if (settings) {
      setFrequencyHours(settings.frequency_hours);
      setMaxDays(settings.max_days);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('reminder_settings' as any)
        .update({
          frequency_hours: frequencyHours,
          max_days: maxDays,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-settings'] });
      toast.success('Reminder settings updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update settings: ' + error.message);
    },
  });

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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Payment Reminder Settings</h1>
          <p className="text-muted-foreground">
            Configure how often and for how long payment reminders are sent to authors with pending fees.
          </p>
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
                <Label htmlFor="frequency" className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Sending Frequency (hours)
                </Label>
                <Input
                  id="frequency"
                  type="number"
                  min={1}
                  max={168}
                  value={frequencyHours}
                  onChange={(e) => setFrequencyHours(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  How often a reminder email is sent. Default: 24 hours (1 per day).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxDays" className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  Max Reminder Duration (days)
                </Label>
                <Input
                  id="maxDays"
                  type="number"
                  min={1}
                  max={30}
                  value={maxDays}
                  onChange={(e) => setMaxDays(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Stop sending reminders after this many days from when the article entered "pending fee" status. Default: 2 days.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))]">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Current behavior:</strong> Authors will receive a payment reminder every{' '}
                  <strong className="text-primary">{frequencyHours} hour{frequencyHours !== 1 ? 's' : ''}</strong> for up to{' '}
                  <strong className="text-primary">{maxDays} day{maxDays !== 1 ? 's' : ''}</strong> after their article is set to "Pending Fee".
                </p>
              </div>

              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="w-full"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </GlassCard>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
