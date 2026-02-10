import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Search, 
  Mail,
  Building,
  Globe,
  FileText,
  Crown,
  ArrowUpDown,
  DollarSign,
  IndianRupee,
  ChevronDown,
  UserCheck,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function AdminAuthors() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAuthor, setSelectedAuthor] = useState<any>(null);
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: authors, isLoading } = useQuery({
    queryKey: ['admin-authors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: articleCounts } = useQuery({
    queryKey: ['admin-author-article-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('author_id');
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach(article => {
        counts[article.author_id] = (counts[article.author_id] || 0) + 1;
      });
      return counts;
    },
  });

  const { data: subscriptions } = useQuery({
    queryKey: ['admin-author-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      
      const subMap: Record<string, any> = {};
      data?.forEach(sub => {
        subMap[sub.user_id] = sub;
      });
      return subMap;
    },
  });

  const changeCurrencyMutation = useMutation({
    mutationFn: async ({ authorId, isIndian }: { authorId: string; isIndian: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_indian: isIndian })
        .eq('id', authorId);
      if (error) throw error;
    },
    onSuccess: (_, { isIndian }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-authors'] });
      toast.success(`Currency changed to ${isIndian ? 'INR' : 'USD'} successfully`);
    },
    onError: (error) => {
      toast.error('Failed to change currency: ' + error.message);
    },
  });

  const { data: coAuthorsMap } = useQuery({
    queryKey: ['admin-co-authors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('co_authors')
        .select('*, co_author_certificates(id, certificate_url, payment_status)');
      if (error) throw error;
      const map: Record<string, any[]> = {};
      data?.forEach(ca => {
        if (!map[ca.article_id]) map[ca.article_id] = [];
        map[ca.article_id].push(ca);
      });
      return map;
    },
  });

  const { data: authorArticlesMap } = useQuery({
    queryKey: ['admin-author-articles-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, author_id, reference_number');
      if (error) throw error;
      const map: Record<string, any[]> = {};
      data?.forEach(a => {
        if (!map[a.author_id]) map[a.author_id] = [];
        map[a.author_id].push(a);
      });
      return map;
    },
  });

  const [expandedAuthor, setExpandedAuthor] = useState<string | null>(null);

  const downloadCertMutation = useMutation({
    mutationFn: async ({ articleId, fileType }: { articleId: string; fileType: string }) => {
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType: 'co_author_certificate' },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.url) window.open(data.url, '_blank');
    },
    onError: (error) => {
      toast.error('Failed to download: ' + error.message);
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ authorId, newPlan }: { authorId: string; newPlan: 'free' | 'pro' }) => {
      if (newPlan === 'free') {
        // Deactivate all active subscriptions for this user
        const { error } = await supabase
          .from('user_subscriptions')
          .update({ is_active: false })
          .eq('user_id', authorId)
          .eq('is_active', true);
        if (error) throw error;
      } else {
        // First deactivate existing active subscriptions
        await supabase
          .from('user_subscriptions')
          .update({ is_active: false })
          .eq('user_id', authorId)
          .eq('is_active', true);
        
        // Create a new Pro subscription (1 month)
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        
        const { error } = await supabase
          .from('user_subscriptions')
          .insert({
            user_id: authorId,
            plan_type: 'pro',
            starts_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            is_active: true,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, { newPlan }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-author-subscriptions'] });
      toast.success(`Plan changed to ${newPlan === 'pro' ? 'Pro' : 'Free'} successfully`);
      setIsPlanDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Failed to change plan: ' + error.message);
    },
  });

  const getAuthorPlan = (authorId: string) => {
    const sub = subscriptions?.[authorId];
    if (sub && sub.plan_type === 'pro' && sub.is_active) {
      // Check expiry
      if (sub.expires_at && new Date(sub.expires_at) > new Date()) {
        return 'pro';
      }
    }
    return 'free';
  };

  const filteredAuthors = authors?.filter(author =>
    author.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    author.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-display text-3xl font-bold mb-2">Manage Authors</h1>
        <p className="text-muted-foreground">View and manage registered authors</p>
      </motion.div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 glass-input max-w-md"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{authors?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total Authors</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {authors?.filter(a => !a.is_indian).length || 0}
              </p>
              <p className="text-sm text-muted-foreground">International</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {authors?.filter(a => a.is_indian).length || 0}
              </p>
              <p className="text-sm text-muted-foreground">Indian</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Authors Grid */}
      {!filteredAuthors?.length ? (
        <GlassCard>
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No authors found</p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAuthors.map((author, index) => {
            const plan = getAuthorPlan(author.id);
            return (
              <motion.div
                key={author.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <GlassCard className="h-full">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-lg font-bold text-primary-foreground">
                      {author.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{author.full_name}</h3>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <Mail className="w-3 h-3" />
                        <span className="truncate">{author.email}</span>
                      </div>
                      {author.affiliation && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <Building className="w-3 h-3" />
                          <span className="truncate">{author.affiliation}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            author.is_indian 
                              ? 'bg-orange-500/20 text-orange-400' 
                              : 'bg-green-500/20 text-green-400'
                          }`}>
                            {author.is_indian ? 'India' : author.country || 'International'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${
                            plan === 'pro'
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {plan === 'pro' && <Crown className="w-3 h-3" />}
                            {plan === 'pro' ? 'Pro' : 'Free'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <FileText className="w-3 h-3" />
                          {articleCounts?.[author.id] || 0}
                        </div>
                      </div>
                      {/* Currency Toggle */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Currency:</span>
                        <Select
                          value={author.is_indian ? 'INR' : 'USD'}
                          onValueChange={(val) => changeCurrencyMutation.mutate({ authorId: author.id, isIndian: val === 'INR' })}
                        >
                          <SelectTrigger className="h-7 text-xs w-20 glass-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="INR">₹ INR</SelectItem>
                            <SelectItem value="USD">$ USD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => {
                            setSelectedAuthor(author);
                            setIsPlanDialogOpen(true);
                          }}
                        >
                          <ArrowUpDown className="w-3 h-3 mr-1" />
                          Plan
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => setExpandedAuthor(expandedAuthor === author.id ? null : author.id)}
                        >
                          <UserCheck className="w-3 h-3 mr-1" />
                          Co-Authors
                        </Button>
                      </div>

                      {/* Expanded Co-Authors */}
                      {expandedAuthor === author.id && (
                        <div className="mt-3 pt-3 border-t border-[hsl(var(--glass-border))] space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Co-Authors</p>
                          {(() => {
                            const articles = authorArticlesMap?.[author.id] || [];
                            const allCoAuthors = articles.flatMap((a: any) => {
                              const cas = coAuthorsMap?.[a.id] || [];
                              return cas.map((ca: any) => ({ ...ca, articleTitle: a.title, articleRef: a.reference_number }));
                            });
                            if (!allCoAuthors.length) return <p className="text-xs text-muted-foreground">No co-authors</p>;
                            return allCoAuthors.map((ca: any) => (
                              <div key={ca.id} className="p-2 rounded-lg bg-[hsl(var(--glass-bg))] text-xs space-y-1">
                                <p className="font-medium">{ca.name}</p>
                                <p className="text-muted-foreground">{ca.email}</p>
                                {ca.affiliation && <p className="text-muted-foreground">{ca.affiliation}</p>}
                                <p className="text-muted-foreground text-[10px]">Article: {ca.articleRef}</p>
                                {ca.co_author_certificates?.map((cert: any) => (
                                  cert.certificate_url && (
                                    <Button
                                      key={cert.id}
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[10px] mt-1"
                                      onClick={() => {
                                        if (cert.certificate_url) window.open(cert.certificate_url, '_blank');
                                      }}
                                    >
                                      Download Cert
                                    </Button>
                                  )
                                ))}
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Plan Change Dialog */}
      <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
        <DialogContent className="glass-card-strong">
          <DialogHeader>
            <DialogTitle className="gradient-text">Change Subscription Plan</DialogTitle>
            <DialogDescription>
              Change plan for {selectedAuthor?.full_name} ({selectedAuthor?.email})
            </DialogDescription>
          </DialogHeader>
          
          {selectedAuthor && (
            <div className="space-y-4 py-4">
              <div className="text-sm text-muted-foreground">
                Current plan: <span className="font-semibold text-foreground">
                  {getAuthorPlan(selectedAuthor.id) === 'pro' ? 'Pro' : 'Free'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant={getAuthorPlan(selectedAuthor.id) === 'free' ? 'default' : 'outline'}
                  className={getAuthorPlan(selectedAuthor.id) === 'free' ? 'gradient-primary' : ''}
                  onClick={() => changePlanMutation.mutate({ authorId: selectedAuthor.id, newPlan: 'free' })}
                  disabled={changePlanMutation.isPending || getAuthorPlan(selectedAuthor.id) === 'free'}
                >
                  Set to Free
                </Button>
                <Button
                  variant={getAuthorPlan(selectedAuthor.id) === 'pro' ? 'default' : 'outline'}
                  className={getAuthorPlan(selectedAuthor.id) === 'pro' ? 'gradient-primary' : ''}
                  onClick={() => changePlanMutation.mutate({ authorId: selectedAuthor.id, newPlan: 'pro' })}
                  disabled={changePlanMutation.isPending || getAuthorPlan(selectedAuthor.id) === 'pro'}
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Set to Pro
                </Button>
              </div>
              
              {changePlanMutation.isPending && (
                <div className="flex items-center justify-center">
                  <GlassSpinner size="sm" />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPlanDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}