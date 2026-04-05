import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IndianRupee, DollarSign, Crown, Award, TrendingUp, FileText, Search, CalendarIcon, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AddManualPaymentDialog } from '@/components/admin/AddManualPaymentDialog';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, subWeeks } from 'date-fns';
import { cn } from '@/lib/utils';

type DatePreset = 'all' | 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

export default function AdminRevenue() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: payments, isLoading } = useQuery({
    queryKey: ['admin-revenue-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, profiles:user_id(full_name, email)')
        .eq('payment_status', 'success')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const getDateRange = (): { from: Date | null; to: Date | null } => {
    const now = new Date();
    switch (datePreset) {
      case 'today': return { from: startOfDay(now), to: endOfDay(now) };
      case 'this_week': return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'last_week': { const lw = subWeeks(now, 1); return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) }; }
      case 'this_month': return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'last_month': { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
      case 'custom': return { from: dateFrom ? startOfDay(dateFrom) : null, to: dateTo ? endOfDay(dateTo) : null };
      default: return { from: null, to: null };
    }
  };

  const dateFilteredPayments = useMemo(() => {
    if (!payments) return [];
    const { from, to } = getDateRange();
    if (!from && !to) return payments;
    return payments.filter(p => {
      if (!p.created_at) return false;
      const d = new Date(p.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [payments, datePreset, dateFrom, dateTo]);

  const coAuthorPayments = dateFilteredPayments.filter(p => {
    const items = p.payment_items as any[];
    return items?.some((item: any) => item.type === 'coauthor_certificate' || item.type === 'co_author_certificate');
  });

  const proPayments = dateFilteredPayments.filter(p => p.discount_code === 'PRO_SUBSCRIPTION');

  const articlePayments = dateFilteredPayments.filter(p => {
    const items = p.payment_items as any[];
    const isCoAuthor = items?.some((item: any) => item.type === 'coauthor_certificate' || item.type === 'co_author_certificate');
    const isPro = p.discount_code === 'PRO_SUBSCRIPTION';
    return !isCoAuthor && !isPro;
  });

  const filteredByTab = activeTab === 'coauthor' ? coAuthorPayments
    : activeTab === 'pro' ? proPayments
    : activeTab === 'articles' ? articlePayments
    : dateFilteredPayments;

  const displayPayments = searchQuery.trim()
    ? filteredByTab.filter((p) => {
        const profile = p.profiles as any;
        const q = searchQuery.toLowerCase();
        return (
          profile?.full_name?.toLowerCase().includes(q) ||
          profile?.email?.toLowerCase().includes(q) ||
          p.transaction_id?.toLowerCase().includes(q)
        );
      })
    : filteredByTab;

  const totalINR = displayPayments.reduce((s, p) => p.currency === 'INR' ? s + Number(p.final_amount) : s, 0);
  const totalUSD = displayPayments.reduce((s, p) => p.currency === 'USD' ? s + Number(p.final_amount) : s, 0);
  const totalUSDT = displayPayments.reduce((s, p) => p.currency === 'USDT' ? s + Number(p.final_amount) : s, 0);

  const getPaymentType = (payment: any) => {
    if (payment.discount_code === 'PRO_SUBSCRIPTION') return 'Pro Plan';
    const items = payment.payment_items as any[];
    if (items?.some((i: any) => i.type === 'coauthor_certificate' || i.type === 'co_author_certificate')) return 'Co-Author Certificate';
    if (items?.some((i: any) => i.type === 'article_fee')) return 'Article Fee';
    return 'Other';
  };

  const clearDateFilter = () => {
    setDatePreset('all');
    setDateFrom(undefined);
    setDateTo(undefined);
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">Revenue</h1>
          <p className="text-muted-foreground">All payments received — Article Fees, Co-Author Certificates & Pro Plan subscriptions</p>
        </div>
        <AddManualPaymentDialog />
      </motion.div>

      {/* Search & Date Filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by author name, email, or transaction ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={datePreset} onValueChange={(v: DatePreset) => setDatePreset(v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="last_week">Last Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
        {datePreset !== 'all' && (
          <Button variant="ghost" size="icon" onClick={clearDateFilter} className="shrink-0">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Custom date pickers */}
      {datePreset === 'custom' && (
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full sm:w-[200px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'PPP') : 'From date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full sm:w-[200px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'PPP') : 'To date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Date range label */}
      {datePreset !== 'all' && (
        <div className="mb-4">
          <Badge variant="secondary" className="text-xs">
            {datePreset === 'custom'
              ? `${dateFrom ? format(dateFrom, 'MMM d, yyyy') : '...'} – ${dateTo ? format(dateTo, 'MMM d, yyyy') : '...'}`
              : `Showing: ${datePreset.replace('_', ' ')}`}
            {' '}• {displayPayments.length} payment(s)
          </Badge>
        </div>
      )}

      {/* Revenue Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <GlassCard>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <IndianRupee className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenue (INR)</p>
              <p className="text-2xl font-bold">₹{totalINR.toLocaleString()}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenue (USD)</p>
              <p className="text-2xl font-bold">${totalUSD.toLocaleString()}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-teal-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenue (USDT)</p>
              <p className="text-2xl font-bold">${totalUSDT.toLocaleString()}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Tabs */}
      <GlassCard>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="all" className="gap-2">
              <TrendingUp className="w-4 h-4" /> All
            </TabsTrigger>
            <TabsTrigger value="articles" className="gap-2">
              <FileText className="w-4 h-4" /> Article Fees
            </TabsTrigger>
            <TabsTrigger value="coauthor" className="gap-2">
              <Award className="w-4 h-4" /> Co-Author Certs
            </TabsTrigger>
            <TabsTrigger value="pro" className="gap-2">
              <Crown className="w-4 h-4" /> Pro Plan
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {displayPayments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No payments found
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="space-y-3 sm:hidden">
                  {displayPayments.map((payment) => {
                    const profile = payment.profiles as any;
                    const type = getPaymentType(payment);
                    const currencySymbol = payment.currency === 'INR' ? '₹' : '$';
                    return (
                      <div key={payment.id} className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{profile?.full_name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                          </div>
                          <Badge variant={type === 'Pro Plan' ? 'default' : 'secondary'} className="shrink-0">
                            {type}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-bold">{currencySymbol}{Number(payment.final_amount).toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(payment.created_at!).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="overflow-x-auto hidden sm:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[hsl(var(--glass-border))]">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Author</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Type</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Amount</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Gateway</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Transaction ID</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayPayments.map((payment) => {
                        const profile = payment.profiles as any;
                        const type = getPaymentType(payment);
                        const currencySymbol = payment.currency === 'INR' ? '₹' : '$';
                        return (
                          <tr key={payment.id} className="border-b border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors">
                            <td className="py-3 px-4">
                              <p className="font-medium text-sm">{profile?.full_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{profile?.email}</p>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant={type === 'Pro Plan' ? 'default' : 'secondary'}>
                                {type}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 font-bold">
                              {currencySymbol}{Number(payment.final_amount).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-sm capitalize">{payment.payment_gateway}</td>
                            <td className="py-3 px-4 text-sm font-mono text-muted-foreground max-w-[150px] truncate">
                              {payment.transaction_id || 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">
                              {new Date(payment.created_at!).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </GlassCard>
    </DashboardLayout>
  );
}
