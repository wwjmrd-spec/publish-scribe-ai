import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Eye, CreditCard, ShoppingCart, Search, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

const EVENT_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  cart_visit: { label: 'Visited Cart', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: ShoppingCart },
  pay_clicked: { label: 'Clicked Pay', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: CreditCard },
  article_selected: { label: 'Selected Article', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Eye },
};

export default function AdminPaymentActivity() {
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('all');

  const { data: activities, isLoading, refetch } = useQuery({
    queryKey: ['admin-payment-activity', eventFilter],
    queryFn: async () => {
      let query = supabase
        .from('payment_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (eventFilter !== 'all') {
        query = query.eq('event_type', eventFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const filtered = activities?.filter((a) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      a.user_email?.toLowerCase().includes(s) ||
      a.user_name?.toLowerCase().includes(s) ||
      a.article_title?.toLowerCase().includes(s) ||
      a.article_reference?.toLowerCase().includes(s) ||
      a.product_type?.toLowerCase().includes(s)
    );
  });

  const stats = {
    totalVisits: activities?.filter(a => a.event_type === 'cart_visit').length ?? 0,
    totalPayClicks: activities?.filter(a => a.event_type === 'pay_clicked').length ?? 0,
    uniqueUsers: new Set(activities?.map(a => a.user_id)).size,
  };

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold mb-2">Payment Activity</h1>
          <p className="text-muted-foreground">Track who visited cart, clicked pay, and for what products</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <GlassCard className="text-center py-4">
            <ShoppingCart className="w-6 h-6 mx-auto mb-2 text-blue-400" />
            <p className="text-2xl font-bold">{stats.totalVisits}</p>
            <p className="text-xs text-muted-foreground">Cart Visits</p>
          </GlassCard>
          <GlassCard className="text-center py-4">
            <CreditCard className="w-6 h-6 mx-auto mb-2 text-amber-400" />
            <p className="text-2xl font-bold">{stats.totalPayClicks}</p>
            <p className="text-xs text-muted-foreground">Pay Clicks</p>
          </GlassCard>
          <GlassCard className="text-center py-4">
            <Eye className="w-6 h-6 mx-auto mb-2 text-purple-400" />
            <p className="text-2xl font-bold">{stats.uniqueUsers}</p>
            <p className="text-xs text-muted-foreground">Unique Users</p>
          </GlassCard>
        </div>

        {/* Filters */}
        <GlassCard className="mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, article..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="cart_visit">Cart Visits</SelectItem>
                <SelectItem value="pay_clicked">Pay Clicks</SelectItem>
                <SelectItem value="article_selected">Article Selected</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </GlassCard>

        {/* Table */}
        <GlassCard>
          {isLoading ? (
            <div className="flex justify-center py-12"><GlassSpinner size="lg" /></div>
          ) : !filtered?.length ? (
            <div className="text-center py-12 text-muted-foreground">No activity recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Article</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => {
                    const evt = EVENT_LABELS[a.event_type] || { label: a.event_type, color: 'bg-muted text-muted-foreground', icon: Eye };
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(a.created_at), 'MMM dd, HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{a.user_name || '—'}</p>
                            <p className="text-xs text-muted-foreground truncate">{a.user_email || '—'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={evt.color}>
                            {evt.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{a.product_type || '—'}</TableCell>
                        <TableCell>
                          {a.article_reference ? (
                            <div className="min-w-0">
                              <p className="text-xs font-mono text-primary">{a.article_reference}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{a.article_title}</p>
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{a.payment_gateway || '—'}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {a.amount ? `${a.currency === 'INR' ? '₹' : a.currency === 'USDT' ? '₮' : '$'}${a.amount}` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </DashboardLayout>
  );
}
