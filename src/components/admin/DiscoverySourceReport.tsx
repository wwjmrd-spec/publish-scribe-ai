import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Search, Users, Share2, CalendarDays } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';

export function DiscoverySourceReport() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['discovery-source-report', dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const { data: articles, error } = await supabase
        .from('articles')
        .select('discovery_source, created_at')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      if (error) throw error;

      const counts = { google_search: 0, friend_colleague: 0, social_media: 0, unknown: 0 };
      articles?.forEach((a: any) => {
        if (a.discovery_source && counts.hasOwnProperty(a.discovery_source)) {
          counts[a.discovery_source as keyof typeof counts]++;
        } else {
          counts.unknown++;
        }
      });

      return { counts, total: articles?.length || 0 };
    },
  });

  const sources = [
    { key: 'google_search', label: 'Google Search', icon: <Search className="w-5 h-5" />, color: 'text-blue-400' },
    { key: 'friend_colleague', label: 'Friend / Colleague', icon: <Users className="w-5 h-5" />, color: 'text-emerald-400' },
    { key: 'social_media', label: 'Social Media', icon: <Share2 className="w-5 h-5" />, color: 'text-purple-400' },
  ];

  if (isLoading) {
    return (
      <GlassCard>
        <div className="flex items-center justify-center h-32">
          <GlassSpinner size="md" />
        </div>
      </GlassCard>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Search className="w-6 h-6 text-primary" />
            <h2 className="font-display text-xl font-semibold">Discovery Sources</h2>
          </div>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <CalendarDays className="w-4 h-4" />
                  {format(dateRange.from, 'MMM d')} – {format(dateRange.to, 'MMM d, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDateRange({ from: range.from, to: range.to });
                    } else if (range?.from) {
                      setDateRange({ from: range.from, to: range.from });
                    }
                  }}
                  className={cn("p-3 pointer-events-auto")}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {sources.map((source) => {
            const count = data?.counts[source.key as keyof typeof data.counts] || 0;
            const pct = data?.total ? Math.round((count / data.total) * 100) : 0;
            return (
              <div key={source.key} className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] space-y-2">
                <div className={`flex items-center gap-2 ${source.color}`}>
                  {source.icon}
                  <span className="text-xs font-medium">{source.label}</span>
                </div>
                <p className="text-2xl font-bold">{count}</p>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${source.key === 'google_search' ? 'bg-blue-400' : source.key === 'friend_colleague' ? 'bg-emerald-400' : 'bg-purple-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{pct}% of total</p>
              </div>
            );
          })}
        </div>
        {data?.counts.unknown ? (
          <p className="text-xs text-muted-foreground mt-3">
            + {data.counts.unknown} submissions without source data
          </p>
        ) : null}
      </GlassCard>
    </motion.div>
  );
}
