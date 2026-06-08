import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useReferral } from '@/hooks/useReferral';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Gift,
  Copy,
  Users,
  Award,
  Percent,
  CheckCircle,
  Clock,
  Share2,
  Tag,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Rewards() {
  const { referral, isLoading } = useReferral();
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (referral.referralCode) {
      navigator.clipboard.writeText(referral.referralCode);
      setCopied(true);
      toast({ title: 'Copied!', description: 'Referral code copied to clipboard.' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout type="author">
        <div className="flex items-center justify-center h-64">
          <GlassSpinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="author">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Referral Rewards 🎁</h1>
        <p className="text-muted-foreground">
          Earn <strong className="text-foreground">{referral.referrerPct}%</strong> back for every friend you refer — your friend saves <strong className="text-foreground">{referral.refereePct}%</strong> on their publication fee.
        </p>
      </motion.div>

      {/* Referral Code Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <GlassCard className="text-center">
          <div className="w-20 h-20 rounded-full gradient-secondary flex items-center justify-center mx-auto mb-4">
            <Share2 className="w-10 h-10 text-secondary-foreground" />
          </div>
          <h2 className="font-display text-xl font-semibold mb-2">Your Referral Code</h2>
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-[hsl(var(--glass-bg-strong))] border border-[hsl(var(--glass-border))] mb-4">
            <span className="font-mono text-2xl font-bold tracking-[0.3em] gradient-text">
              {referral.referralCode || '--------'}
            </span>
            <Button variant="ghost" size="icon" onClick={copyCode} className="shrink-0">
              {copied ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Share this code with other authors. When they sign up and use your code, they get
            <strong className="text-foreground"> {referral.refereePct}% off</strong> their publication fee, and once their article gets published you earn a
            <strong className="text-foreground"> {referral.referrerPct}% discount code</strong> for your next publication.
          </p>
        </GlassCard>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <GlassCard className="hover-glow-cyan">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Referrals</p>
              <p className="text-2xl font-bold">{referral.totalReferred}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="hover-glow-purple">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
              <Award className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Rewards Earned</p>
              <p className="text-2xl font-bold">{referral.totalRewarded}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="hover-glow-cyan">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Percent className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Your Discount</p>
              <p className="text-2xl font-bold">{referral.referrerPct}% per referral</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* How it works */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
        <GlassCard>
          <h2 className="font-display text-xl font-semibold mb-4">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold">1</div>
              <h3 className="font-semibold">Share Your Code</h3>
              <p className="text-sm text-muted-foreground">Send your unique referral code to fellow authors.</p>
            </div>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-secondary flex items-center justify-center text-secondary-foreground font-bold">2</div>
              <h3 className="font-semibold">Friend Saves {referral.refereePct}%</h3>
              <p className="text-sm text-muted-foreground">When they apply your code at checkout, they instantly save {referral.refereePct}% on their publication fee.</p>
            </div>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-accent flex items-center justify-center text-accent-foreground font-bold">3</div>
              <h3 className="font-semibold">You Earn {referral.referrerPct}%</h3>
              <p className="text-sm text-muted-foreground">Once their article is published, you get a {referral.referrerPct}% discount code for your next publication — works for both INR and USD.</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4 border-t border-[hsl(var(--glass-border))] pt-4">
            ⚠️ Your reward code is generated only after the referred author's article is successfully published.
          </p>
        </GlassCard>
      </motion.div>

      {/* Discount Codes */}
      {referral.discountCodes.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-8">
          <GlassCard>
            <h2 className="font-display text-xl font-semibold mb-4">Your Discount Codes</h2>
            <div className="space-y-3">
              {referral.discountCodes.map((dc) => {
                const used = !dc.is_active || (dc.used_count ?? 0) > 0;
                const label =
                  dc.discount_type === 'percentage'
                    ? `${dc.discount_value}% off`
                    : `${dc.currency === 'INR' ? '₹' : '$'}${dc.discount_value} off`;
                return (
                  <div
                    key={dc.code}
                    className="flex items-center justify-between p-4 rounded-lg bg-[hsl(var(--glass-bg))] hover:bg-[hsl(var(--glass-bg-strong))] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <Tag className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <p className="font-mono font-bold text-sm">{dc.code}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    </div>
                    <span className={!used ? 'status-submitted' : 'status-published'}>{!used ? 'Available' : 'Used'}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* History */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <GlassCard>
          <h2 className="font-display text-xl font-semibold mb-4">Referral History</h2>
          {referral.referrals.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center mx-auto mb-4">
                <Gift className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No referrals yet. Share your code to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {referral.referrals.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-[hsl(var(--glass-bg))] hover:bg-[hsl(var(--glass-bg-strong))] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center">
                      {ref.reward_granted ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Clock className="w-5 h-5 text-primary" />}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{ref.referred_email}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {formatDistanceToNow(new Date(ref.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <span className={ref.reward_granted ? 'status-published' : 'status-submitted'}>
                    {ref.reward_granted ? 'Rewarded' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </motion.div>
    </DashboardLayout>
  );
}
