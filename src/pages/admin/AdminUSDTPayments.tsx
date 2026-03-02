import React from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Copy,
} from 'lucide-react';

export default function AdminUSDTPayments() {
  const queryClient = useQueryClient();

  const { data: payments, isLoading } = useQuery({
    queryKey: ['usdt-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, profiles:user_id(full_name, email)')
        .eq('payment_gateway', 'binance')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ paymentId, action }: { paymentId: string; action: 'admin_verify' | 'admin_reject' }) => {
      const { data, error } = await supabase.functions.invoke('verify-binance-payment', {
        body: { paymentId, action },
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['usdt-payments'] });
      toast.success(variables.action === 'admin_verify' ? 'Payment verified successfully' : 'Payment rejected');
    },
    onError: (error) => {
      toast.error('Action failed: ' + error.message);
    },
  });

  const copyTxHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success('Transaction hash copied');
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      under_review: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.pending}`}>
        {status === 'under_review' ? 'Under Review' : status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
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

  const pendingPayments = payments?.filter(p => p.payment_status === 'under_review') || [];
  const otherPayments = payments?.filter(p => p.payment_status !== 'under_review') || [];

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">USDT Payments</h1>
        <p className="text-muted-foreground">Verify and manage Binance USDT payments from international authors</p>
      </motion.div>

      {/* Pending Verification */}
      {pendingPayments.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
          <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Pending Verification ({pendingPayments.length})
          </h2>
          <div className="space-y-4">
            {pendingPayments.map((payment) => {
              const profile = payment.profiles as any;
              return (
                <GlassCard key={payment.id} className="border-amber-500/20">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold text-lg">{payment.final_amount} USDT</span>
                        {statusBadge(payment.payment_status || 'pending')}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><strong>Author:</strong> {profile?.full_name || 'Unknown'} ({profile?.email || 'N/A'})</p>
                        <p><strong>Payment ID:</strong> <code className="text-xs">{payment.id}</code></p>
                        {payment.transaction_id && (
                          <div className="flex items-center gap-2">
                            <strong>Tx Hash:</strong>
                            <code className="text-xs break-all">{payment.transaction_id}</code>
                            <button onClick={() => copyTxHash(payment.transaction_id!)} className="text-muted-foreground hover:text-foreground">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <p><strong>Date:</strong> {new Date(payment.created_at!).toLocaleString()}</p>
                        {payment.discount_code && (
                          <p><strong>Discount:</strong> {payment.discount_code} (-{payment.discount_amount} USDT)</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                        disabled={verifyMutation.isPending}
                        onClick={() => verifyMutation.mutate({ paymentId: payment.id, action: 'admin_verify' })}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        disabled={verifyMutation.isPending}
                        onClick={() => verifyMutation.mutate({ paymentId: payment.id, action: 'admin_reject' })}
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* All USDT Payments History */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          Payment History ({otherPayments.length})
        </h2>

        {otherPayments.length === 0 && pendingPayments.length === 0 ? (
          <GlassCard className="text-center py-12">
            <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-1">No USDT payments yet</h3>
            <p className="text-sm text-muted-foreground">USDT payments from international authors will appear here</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {otherPayments.map((payment) => {
              const profile = payment.profiles as any;
              return (
                <GlassCard key={payment.id} className="py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{payment.final_amount} USDT</span>
                        {statusBadge(payment.payment_status || 'pending')}
                        <span className="text-xs text-muted-foreground">
                          {profile?.full_name || 'Unknown'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(payment.created_at!).toLocaleString()}
                        {payment.transaction_id && ` • Tx: ${payment.transaction_id.slice(0, 20)}...`}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
