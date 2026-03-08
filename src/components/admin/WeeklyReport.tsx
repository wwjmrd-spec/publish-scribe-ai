import React from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/layout/GlassCard';
import { CalendarDays, FileText, Users, DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';

interface WeeklyMetric {
  label: string;
  thisWeek: number;
  lastWeek: number;
  icon: React.ReactNode;
  prefix?: string;
}

export function WeeklyReport() {
  const now = new Date();
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  const { data: weeklyData, isLoading } = useQuery({
    queryKey: ['admin-weekly-report', thisWeekStart.toISOString()],
    queryFn: async () => {
      const [articlesRes, profilesRes, paymentsRes] = await Promise.all([
        supabase.from('articles').select('id, created_at, status'),
        supabase.from('profiles').select('id, created_at'),
        supabase.from('payments').select('id, created_at, final_amount, currency, payment_status').eq('payment_status', 'success'),
      ]);

      if (articlesRes.error) throw articlesRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const inRange = (dateStr: string | null, start: Date, end: Date) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d >= start && d <= end;
      };

      const thisWeekArticles = articlesRes.data?.filter(a => inRange(a.created_at, thisWeekStart, thisWeekEnd)).length || 0;
      const lastWeekArticles = articlesRes.data?.filter(a => inRange(a.created_at, lastWeekStart, lastWeekEnd)).length || 0;

      const thisWeekAuthors = profilesRes.data?.filter(p => inRange(p.created_at, thisWeekStart, thisWeekEnd)).length || 0;
      const lastWeekAuthors = profilesRes.data?.filter(p => inRange(p.created_at, lastWeekStart, lastWeekEnd)).length || 0;

      const calcRevenue = (payments: typeof paymentsRes.data, start: Date, end: Date) => {
        return payments?.filter(p => inRange(p.created_at, start, end)).reduce((sum, p) => {
          if (p.currency === 'USD') return sum + (Number(p.final_amount) * 83);
          return sum + Number(p.final_amount);
        }, 0) || 0;
      };

      const thisWeekRevenue = calcRevenue(paymentsRes.data, thisWeekStart, thisWeekEnd);
      const lastWeekRevenue = calcRevenue(paymentsRes.data, lastWeekStart, lastWeekEnd);

      const thisWeekPublished = articlesRes.data?.filter(a => a.status === 'published' && inRange(a.created_at, thisWeekStart, thisWeekEnd)).length || 0;
      const lastWeekPublished = articlesRes.data?.filter(a => a.status === 'published' && inRange(a.created_at, lastWeekStart, lastWeekEnd)).length || 0;

      return {
        articles: { thisWeek: thisWeekArticles, lastWeek: lastWeekArticles },
        authors: { thisWeek: thisWeekAuthors, lastWeek: lastWeekAuthors },
        revenue: { thisWeek: thisWeekRevenue, lastWeek: lastWeekRevenue },
        published: { thisWeek: thisWeekPublished, lastWeek: lastWeekPublished },
      };
    },
  });

  if (isLoading) {
    return (
      <GlassCard>
        <div className="flex items-center justify-center h-32">
          <GlassSpinner size="md" />
        </div>
      </GlassCard>
    );
  }

  const metrics: WeeklyMetric[] = [
    {
      label: 'New Submissions',
      thisWeek: weeklyData?.articles.thisWeek || 0,
      lastWeek: weeklyData?.articles.lastWeek || 0,
      icon: <FileText className="w-4 h-4" />,
    },
    {
      label: 'New Authors',
      thisWeek: weeklyData?.authors.thisWeek || 0,
      lastWeek: weeklyData?.authors.lastWeek || 0,
      icon: <Users className="w-4 h-4" />,
    },
    {
      label: 'Revenue (₹)',
      thisWeek: weeklyData?.revenue.thisWeek || 0,
      lastWeek: weeklyData?.revenue.lastWeek || 0,
      icon: <DollarSign className="w-4 h-4" />,
      prefix: '₹',
    },
    {
      label: 'Published',
      thisWeek: weeklyData?.published.thisWeek || 0,
      lastWeek: weeklyData?.published.lastWeek || 0,
      icon: <FileText className="w-4 h-4" />,
    },
  ];

  const getTrend = (thisWeek: number, lastWeek: number) => {
    if (thisWeek > lastWeek) return { icon: <TrendingUp className="w-4 h-4 text-green-500" />, color: 'text-green-500', label: 'up' };
    if (thisWeek < lastWeek) return { icon: <TrendingDown className="w-4 h-4 text-red-500" />, color: 'text-red-500', label: 'down' };
    return { icon: <Minus className="w-4 h-4 text-muted-foreground" />, color: 'text-muted-foreground', label: 'same' };
  };

  const getChange = (thisWeek: number, lastWeek: number) => {
    if (lastWeek === 0) return thisWeek > 0 ? '+100%' : '0%';
    const pct = ((thisWeek - lastWeek) / lastWeek) * 100;
    return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
    >
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-display text-xl font-semibold">Weekly Report</h2>
            <p className="text-xs text-muted-foreground">
              {format(thisWeekStart, 'MMM d')} – {format(thisWeekEnd, 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => {
            const trend = getTrend(metric.thisWeek, metric.lastWeek);
            return (
              <div key={metric.label} className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  {metric.icon}
                  <span className="text-xs font-medium">{metric.label}</span>
                </div>
                <p className="text-2xl font-bold">
                  {metric.prefix}{metric.thisWeek.toLocaleString()}
                </p>
                <div className="flex items-center gap-1.5">
                  {trend.icon}
                  <span className={`text-xs font-medium ${trend.color}`}>
                    {getChange(metric.thisWeek, metric.lastWeek)}
                  </span>
                  <span className="text-xs text-muted-foreground">vs last week</span>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </motion.div>
  );
}
