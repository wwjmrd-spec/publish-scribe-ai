import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { 
  Settings, 
  IndianRupee,
  DollarSign,
  Save,
  Crown,
  Wallet,
  Gift,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminFees() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fees, setFees] = useState({
    indian_fee: '',
    international_fee: '',
    indian_fast_track_fee: '',
    international_fast_track_fee: '',
    indian_coauthor_fee: '',
    international_coauthor_fee: '',
    indian_pro_fee: '',
    international_pro_fee: '',
    usdt_fee: '',
    usdt_fast_track_fee: '',
    usdt_coauthor_fee: '',
    usdt_pro_fee: '',
    binance_wallet_address: '',
  });


  const { data: currentFees, isLoading } = useQuery({
    queryKey: ['publication-fees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('publication_fees')
        .select('*')
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  const { data: twoPageFreeSetting } = useQuery({
    queryKey: ['admin-setting-two-page-free'],
    queryFn: async () => {
      const { data } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'two_page_free_enabled')
        .maybeSingle();
      return data?.setting_value === 'true';
    },
  });

  const [twoPageFreeEnabled, setTwoPageFreeEnabled] = useState(true);

  useEffect(() => {
    if (twoPageFreeSetting !== undefined) setTwoPageFreeEnabled(twoPageFreeSetting);
  }, [twoPageFreeSetting]);

  const toggleTwoPageFree = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: existing } = await supabase
        .from('admin_settings')
        .select('id')
        .eq('setting_key', 'two_page_free_enabled')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('admin_settings')
          .update({ setting_value: String(enabled), updated_by: user?.id, updated_at: new Date().toISOString() })
          .eq('setting_key', 'two_page_free_enabled');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_settings')
          .insert({ setting_key: 'two_page_free_enabled', setting_value: String(enabled), updated_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-setting-two-page-free'] });
      toast.success(`2-page free publication ${twoPageFreeEnabled ? 'enabled' : 'disabled'}`);
    },
    onError: (err: any) => toast.error('Failed: ' + err.message),
  });

  useEffect(() => {
    if (currentFees) {
      setFees({
        indian_fee: currentFees.indian_fee?.toString() || '',
        international_fee: currentFees.international_fee?.toString() || '',
        indian_fast_track_fee: (currentFees as any).indian_fast_track_fee?.toString() || '',
        international_fast_track_fee: (currentFees as any).international_fast_track_fee?.toString() || '',
        indian_coauthor_fee: currentFees.indian_coauthor_fee?.toString() || '',
        international_coauthor_fee: currentFees.international_coauthor_fee?.toString() || '',
        indian_pro_fee: currentFees.indian_pro_fee?.toString() || '',
        international_pro_fee: currentFees.international_pro_fee?.toString() || '',
        usdt_fee: (currentFees as any).usdt_fee?.toString() || '',
        usdt_fast_track_fee: (currentFees as any).usdt_fast_track_fee?.toString() || '',
        usdt_coauthor_fee: (currentFees as any).usdt_coauthor_fee?.toString() || '',
        usdt_pro_fee: (currentFees as any).usdt_pro_fee?.toString() || '',
        binance_wallet_address: (currentFees as any).binance_wallet_address?.toString() || '',
      });
    }
  }, [currentFees]);


  const updateMutation = useMutation({
    mutationFn: async () => {
      const feeData: any = {
        indian_fee: parseFloat(fees.indian_fee) || 0,
        international_fee: parseFloat(fees.international_fee) || 0,
        indian_coauthor_fee: parseFloat(fees.indian_coauthor_fee) || 0,
        international_coauthor_fee: parseFloat(fees.international_coauthor_fee) || 0,
        indian_pro_fee: parseFloat(fees.indian_pro_fee) || 0,
        international_pro_fee: parseFloat(fees.international_pro_fee) || 0,
        usdt_fee: parseFloat(fees.usdt_fee) || 0,
        usdt_fast_track_fee: parseFloat(fees.usdt_fast_track_fee) || 0,
        usdt_coauthor_fee: parseFloat(fees.usdt_coauthor_fee) || 0,
        usdt_pro_fee: parseFloat(fees.usdt_pro_fee) || 0,
        binance_wallet_address: fees.binance_wallet_address || null,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      };

      if (currentFees?.id) {
        const { error } = await supabase
          .from('publication_fees')
          .update(feeData)
          .eq('id', currentFees.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('publication_fees')
          .insert(feeData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publication-fees'] });
      toast.success('Publication fees updated');
    },
    onError: (error) => {
      toast.error('Failed to update: ' + error.message);
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Fee Settings</h1>
        <p className="text-muted-foreground">Configure publication and co-author fees</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Indian Authors */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <IndianRupee className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">Indian Authors</h2>
                <p className="text-sm text-muted-foreground">Fees in INR</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Publication Fee (₹)</Label>
                <div className="relative mt-1">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="number" value={fees.indian_fee} onChange={(e) => setFees({ ...fees, indian_fee: e.target.value })} className="pl-10 glass-input" placeholder="1500" />
                </div>
              </div>
              <div>
                <Label>Co-Author Certificate Fee (₹)</Label>
                <div className="relative mt-1">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="number" value={fees.indian_coauthor_fee} onChange={(e) => setFees({ ...fees, indian_coauthor_fee: e.target.value })} className="pl-10 glass-input" placeholder="500" />
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* International Authors */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <GlassCard>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">International Authors</h2>
                <p className="text-sm text-muted-foreground">Fees in USD</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Publication Fee ($)</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="number" value={fees.international_fee} onChange={(e) => setFees({ ...fees, international_fee: e.target.value })} className="pl-10 glass-input" placeholder="50" />
                </div>
              </div>
              <div>
                <Label>Co-Author Certificate Fee ($)</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="number" value={fees.international_coauthor_fee} onChange={(e) => setFees({ ...fees, international_coauthor_fee: e.target.value })} className="pl-10 glass-input" placeholder="10" />
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* USDT / Binance Fees */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="mt-6">
        <GlassCard className="border-amber-500/20">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">USDT (Binance) Fees</h2>
              <p className="text-sm text-muted-foreground">Cryptocurrency fees for international authors paying in USDT</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Publication Fee (USDT)</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">₮</span>
                <Input type="number" value={fees.usdt_fee} onChange={(e) => setFees({ ...fees, usdt_fee: e.target.value })} className="pl-10 glass-input" placeholder="79" />
              </div>
            </div>
            <div>
              <Label>Fast Track Fee (USDT)</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">₮</span>
                <Input type="number" value={fees.usdt_fast_track_fee} onChange={(e) => setFees({ ...fees, usdt_fast_track_fee: e.target.value })} className="pl-10 glass-input" placeholder="10" />
              </div>
            </div>
            <div>
              <Label>Co-Author Certificate Fee (USDT)</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">₮</span>
                <Input type="number" value={fees.usdt_coauthor_fee} onChange={(e) => setFees({ ...fees, usdt_coauthor_fee: e.target.value })} className="pl-10 glass-input" placeholder="10" />
              </div>
            </div>
            <div>
              <Label>Pro Plan Fee (USDT/month)</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">₮</span>
                <Input type="number" value={fees.usdt_pro_fee} onChange={(e) => setFees({ ...fees, usdt_pro_fee: e.target.value })} className="pl-10 glass-input" placeholder="19" />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Label>Binance Wallet Address (TRC-20)</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">Authors will send USDT to this address. Make sure it supports TRC-20 network.</p>
            <Input
              value={fees.binance_wallet_address}
              onChange={(e) => setFees({ ...fees, binance_wallet_address: e.target.value })}
              className="glass-input font-mono text-sm"
              placeholder="Enter your TRC-20 USDT wallet address"
            />
          </div>

          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-muted-foreground">
              <strong>How USDT payments work:</strong> International authors can choose to pay in USDT. They send the exact amount to your wallet address, then submit the transaction hash. You verify the payment manually from the admin panel.
            </p>
          </div>
        </GlassCard>
      </motion.div>

      {/* Pro Plan Fees */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-6">
        <GlassCard className="border-primary/20">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center glow-purple">
              <Crown className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">Pro Plan Pricing</h2>
              <p className="text-sm text-muted-foreground">Monthly subscription fee for Pro plan</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Indian Pro Plan Fee (₹/month)</Label>
              <div className="relative mt-1">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="number" value={fees.indian_pro_fee} onChange={(e) => setFees({ ...fees, indian_pro_fee: e.target.value })} className="pl-10 glass-input" placeholder="999" />
              </div>
            </div>
            <div>
              <Label>International Pro Plan Fee ($/month)</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="number" value={fees.international_pro_fee} onChange={(e) => setFees({ ...fees, international_pro_fee: e.target.value })} className="pl-10 glass-input" placeholder="19" />
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <strong>Pro plan includes:</strong> 5 review report downloads/month, 4 co-author certificates/month. Valid for 1 month.
            </p>
          </div>
        </GlassCard>
      </motion.div>

      {/* 2-Page Free Publication Toggle */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-6">
        <GlassCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Gift className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">2-Page Free Publication</h2>
                <p className="text-sm text-muted-foreground">
                  When enabled, articles with 2 or fewer pages are published free (no fee required). When disabled, all articles require a publication fee.
                </p>
              </div>
            </div>
            <Switch
              checked={twoPageFreeEnabled}
              onCheckedChange={(checked) => {
                setTwoPageFreeEnabled(checked);
                toggleTwoPageFree.mutate(checked);
              }}
            />
          </div>
        </GlassCard>
      </motion.div>

      {/* Save Button */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-6 flex justify-end">
        <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </Button>
      </motion.div>

      {/* Info Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-6">
        <GlassCard className="bg-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold mb-1">How fees work</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Publication fee is charged per article after approval</li>
                <li>• Co-author certificate fee is optional and charged per co-author</li>
                <li>• Indian authors pay in INR via Razorpay</li>
                <li>• International authors pay in USD via PayPal or Razorpay</li>
                <li>• International authors can also pay in USDT via Binance (manual verification)</li>
                <li>• Pro plan gives authors 5 review reports and 4 co-author certificates per month</li>
                <li>• Free plan allows 2 review report downloads per month</li>
              </ul>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </DashboardLayout>
  );
}
