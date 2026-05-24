import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/layout/GlassCard';
import {
  CalendarDays, FileText, Users, DollarSign, IndianRupee, Mail, CheckCircle2,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { format } from 'date-fns';
import { getRangeStart, inRange } from '@/lib/timeRange';
import { useDashboardRange } from '@/hooks/useDashboardRange';

interface Metric {
  label: string;
  current: number;
  previous: number;
  icon: React.ReactNode;
  prefix?: string;
}

export function TimeRangeReport() {
  const [range] = useDashboardRange();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-timerange-report'],
    queryFn: async () => {
      const [articlesRes, profilesRes, paymentsRes, emailsRes] = await Promise.all([
        supabase.from('articles').select('id, created_at, status'),
        supabase.from('profiles').select('id, created_at'),
        supabase.from('payments').select('id, created_at, final_amount, currency, payment_status').eq('payment_status', 'success'),
        supabase.from('email_log').select('id, created_at, status'),
      ]);
      if (articlesRes.error) throw articlesRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      return {
        articles: articlesRes.data || [],
        profiles: profilesRes.data || [],
        payments: paymentsRes.data || [],
        emails: emailsRes.data || [],
      };
    },
  });

  const metrics = useMemo<Metric[]>(() => {
    if (!data) return [];
    const start = getRangeStart(range);
    const now = new Date();
    const prevStart = start ? new Date(start.getTime() - (now.getTime() - start.getTime())) : null;
    const prevEnd = start;

    const inCurrent = (d: string | null) => inRange(d, start, now);
    const inPrevious = (d: string | null) => {
      if (!d || !prevStart || !prevEnd) return false;
      const dt = new Date(d);
      return dt >= prevStart && dt < prevEnd;
    };

    const sumPayments = (filterFn: (d: string | null) => boolean, currency: string) =>
      data.payments
        .filter(p => p.currency === currency && filterFn(p.created_at))
        .reduce((s, p) => s + Number(p.final_amount), 0);

    return [
      {
        label: 'Submissions',
        current: data.articles.filter(a => inCurrent(a.created_at)).length,
        previous: data.articles.filter(a => inPrevious(a.created_at)).length,
        icon: <FileText className="w-4 h-4" />,
      },
      {
        label: 'New Authors',
        current: data.profiles.filter(p => inCurrent(p.created_at)).length,
        previous: data.profiles.filter(p => inPrevious(p.created_at)).length,
        icon: <Users className="w-4 h-4" />,
      },
      {
        label: 'Published',
        current: data.articles.filter(a => a.status === 'published' && inCurrent(a.created_at)).length,
        previous: data.articles.filter(a => a.status === 'published' && inPrevious(a.created_at)).length,
        icon: <CheckCircle2 className="w-4 h-4" />,
      },
      {
        label: 'Revenue (₹)',
        current: sumPayments(inCurrent, 'INR'),
        previous: sumPayments(inPrevious, 'INR'),
        icon: <IndianRupee className="w-4 h-4" />,
        prefix: '₹',
      },
      {
        label: 'Revenue ($)',
        current: sumPayments(inCurrent, 'USD'),
        previous: sumPayments(inPrevious, 'USD'),
        icon: <DollarSign className="w-4 h-4" />,
        prefix: '$',
      },
      {
        label: 'Emails Sent',
        current: data.emails.filter(e => inCurrent(e.created_at)).length,
        previous: data.emails.filter(e => inPrevious(e.created_at)).length,
        icon: <Mail className="w-4 h-4" />,
      },
    ];
  }, [data, range]);

  const getTrend = (cur: number, prev: number) => {
    if (cur > prev) return { icon: <TrendingUp className="w-4 h-4 text-green-500" />, color: 'text-green-500' };
    if (cur < prev) return { icon: <TrendingDown className="w-4 h-4 text-red-500" />, color: 'text-red-500' };
    return { icon: <Minus className="w-4 h-4 text-muted-foreground" />, color: 'text-muted-foreground' };
  };

  const getChange = (cur: number, prev: number) => {
    if (range === 'all') return null;
    if (prev === 0) return cur > 0 ? '+100%' : '0%';
    const pct = ((cur - prev) / prev) * 100;
    return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
  };

  const rangeStart = getRangeStart(range);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-display text-xl font-semibold">Activity Report</h2>
            <p className="text-xs text-muted-foreground">
              {rangeStart
                ? `${format(rangeStart, 'MMM d, yyyy')} – ${format(new Date(), 'MMM d, yyyy')}`
                : 'All time'}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><GlassSpinner size="md" /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {metrics.map((m) => {
              const trend = getTrend(m.current, m.previous);
              const change = getChange(m.current, m.previous);
              return (
                <div key={m.label} className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {m.icon}
                    <span className="text-xs font-medium">{m.label}</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {m.prefix}{m.current.toLocaleString()}
                  </p>
                  {change && (
                    <div className="flex items-center gap-1.5">
                      {trend.icon}
                      <span className={`text-xs font-medium ${trend.color}`}>{change}</span>
                      <span className="text-xs text-muted-foreground">vs prev</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
