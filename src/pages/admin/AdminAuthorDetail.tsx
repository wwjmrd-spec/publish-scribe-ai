import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Mail,
  Building,
  Globe,
  FileText,
  Crown,
  ArrowUpDown,
  Download,
  Eye,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';

export default function AdminAuthorDetail() {
  const { authorId } = useParams<{ authorId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: author, isLoading } = useQuery({
    queryKey: ['admin-author-detail', authorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authorId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!authorId,
  });

  const { data: articles } = useQuery({
    queryKey: ['admin-author-articles', authorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, reference_number, status, created_at')
        .eq('author_id', authorId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!authorId,
  });

  const { data: subscription } = useQuery({
    queryKey: ['admin-author-subscription', authorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', authorId!)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!authorId,
  });

  const { data: coAuthors } = useQuery({
    queryKey: ['admin-author-coauthors', authorId],
    queryFn: async () => {
      const articleIds = articles?.map(a => a.id) || [];
      if (!articleIds.length) return [];
      const { data, error } = await supabase
        .from('co_authors')
        .select('*, co_author_certificates(id, certificate_url, payment_status)')
        .in('article_id', articleIds);
      if (error) throw error;
      return data;
    },
    enabled: !!articles?.length,
  });

  const changeCurrencyMutation = useMutation({
    mutationFn: async (isIndian: boolean) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_indian: isIndian })
        .eq('id', authorId!);
      if (error) throw error;
    },
    onSuccess: (_, isIndian) => {
      queryClient.invalidateQueries({ queryKey: ['admin-author-detail', authorId] });
      toast.success(`Currency changed to ${isIndian ? 'INR' : 'USD'}`);
    },
    onError: (error) => toast.error('Failed: ' + error.message),
  });

  const changePlanMutation = useMutation({
    mutationFn: async (newPlan: 'free' | 'pro') => {
      if (newPlan === 'free') {
        const { error } = await supabase
          .from('user_subscriptions')
          .update({ is_active: false })
          .eq('user_id', authorId!)
          .eq('is_active', true);
        if (error) throw error;
      } else {
        await supabase
          .from('user_subscriptions')
          .update({ is_active: false })
          .eq('user_id', authorId!)
          .eq('is_active', true);
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        const { error } = await supabase
          .from('user_subscriptions')
          .insert({
            user_id: authorId!,
            plan_type: 'pro',
            starts_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            is_active: true,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, newPlan) => {
      queryClient.invalidateQueries({ queryKey: ['admin-author-subscription', authorId] });
      toast.success(`Plan changed to ${newPlan === 'pro' ? 'Pro' : 'Free'}`);
    },
    onError: (error) => toast.error('Failed: ' + error.message),
  });

  const getPlan = () => {
    if (subscription?.plan_type === 'pro' && subscription?.is_active) {
      if (subscription.expires_at && new Date(subscription.expires_at) > new Date()) return 'pro';
    }
    return 'free';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      submitted: 'bg-blue-500/20 text-blue-400',
      under_review: 'bg-yellow-500/20 text-yellow-400',
      pending_fee: 'bg-orange-500/20 text-orange-400',
      paid: 'bg-cyan-500/20 text-cyan-400',
      published: 'bg-green-500/20 text-green-400',
      rejected: 'bg-red-500/20 text-red-400',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
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

  if (!author) {
    return (
      <DashboardLayout type="admin">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Author not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/authors')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Authors
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const plan = getPlan();

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/authors')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Authors
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Author Info */}
          <div className="lg:col-span-2 space-y-6">
            <GlassCard>
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-2xl font-bold text-primary-foreground">
                  {author.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h1 className="font-display text-2xl font-bold">{author.full_name}</h1>
                  <div className="flex items-center gap-1 text-muted-foreground mt-1">
                    <Mail className="w-4 h-4" />
                    <span>{author.email}</span>
                  </div>
                  {author.affiliation && (
                    <div className="flex items-center gap-1 text-muted-foreground mt-1">
                      <Building className="w-4 h-4" />
                      <span>{author.affiliation}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-muted-foreground mt-1">
                    <Globe className="w-4 h-4" />
                    <span>{author.country || 'Not specified'}</span>
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Articles */}
            <GlassCard>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Articles ({articles?.length || 0})
              </h3>
              {!articles?.length ? (
                <p className="text-sm text-muted-foreground">No articles submitted</p>
              ) : (
                <div className="space-y-3">
                  {articles.map(article => (
                    <div
                      key={article.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))] cursor-pointer hover:bg-[hsl(var(--glass-bg-strong))] transition-colors"
                      onClick={() => navigate(`/admin/articles/${article.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{article.title}</p>
                        <p className="text-xs text-muted-foreground">{article.reference_number}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusBadge(article.status || '')}`}>
                          {(article.status || '').replace(/_/g, ' ')}
                        </span>
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Co-Authors */}
            {coAuthors && coAuthors.length > 0 && (
              <GlassCard>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                  Co-Authors ({coAuthors.length})
                </h3>
                <div className="space-y-2">
                  {coAuthors.map((ca: any) => (
                    <div key={ca.id} className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] text-sm space-y-1">
                      <p className="font-medium">{ca.name}</p>
                      <p className="text-muted-foreground text-xs">{ca.email}</p>
                      {ca.affiliation && <p className="text-muted-foreground text-xs">{ca.affiliation}</p>}
                      {ca.co_author_certificates?.map((cert: any) =>
                        cert.certificate_url && (
                          <Button
                            key={cert.id}
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] mt-1"
                            onClick={() => window.open(cert.certificate_url, '_blank')}
                          >
                            <Download className="w-3 h-3 mr-1" /> Download Cert
                          </Button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <GlassCard>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Plan</h3>
              <div className="flex items-center gap-2 mb-4">
                <span className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${
                  plan === 'pro' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {plan === 'pro' && <Crown className="w-3 h-3" />}
                  {plan === 'pro' ? 'Pro' : 'Free'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={plan === 'free' ? 'default' : 'outline'}
                  size="sm"
                  className={plan === 'free' ? 'gradient-primary' : ''}
                  onClick={() => changePlanMutation.mutate('free')}
                  disabled={changePlanMutation.isPending || plan === 'free'}
                >
                  Free
                </Button>
                <Button
                  variant={plan === 'pro' ? 'default' : 'outline'}
                  size="sm"
                  className={plan === 'pro' ? 'gradient-primary' : ''}
                  onClick={() => changePlanMutation.mutate('pro')}
                  disabled={changePlanMutation.isPending || plan === 'pro'}
                >
                  <Crown className="w-3 h-3 mr-1" /> Pro
                </Button>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Currency</h3>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  author.is_indian ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                }`}>
                  {author.is_indian ? '₹ INR' : '$ USD'}
                </span>
                <Select
                  value={author.is_indian ? 'INR' : 'USD'}
                  onValueChange={(val) => changeCurrencyMutation.mutate(val === 'INR')}
                >
                  <SelectTrigger className="h-8 text-xs w-24 glass-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">₹ INR</SelectItem>
                    <SelectItem value="USD">$ USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Info</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Joined:</span>
                  <p className="font-medium">{new Date(author.created_at || '').toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Referral Code:</span>
                  <p className="font-medium font-mono">{author.referral_code || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Articles:</span>
                  <p className="font-medium">{articles?.length || 0}</p>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
