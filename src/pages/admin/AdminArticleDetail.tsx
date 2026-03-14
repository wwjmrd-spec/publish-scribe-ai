import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Download,
  Brain,
  Award,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  Mail,
} from 'lucide-react';
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
import type { Database } from '@/integrations/supabase/types';

type ArticleStatus = Database['public']['Enums']['article_status'];

export default function AdminArticleDetail() {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishDetails, setPublishDetails] = useState({
    volume: '',
    issue: '',
    pageNumber: '',
    year: new Date().getFullYear().toString(),
    publishedLink: '',
  });

  const { data: article, isLoading } = useQuery({
    queryKey: ['admin-article-detail', articleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          profiles:author_id (full_name, email, country, affiliation),
          co_authors (id, name, email, affiliation, co_author_certificates (id, certificate_url, payment_status))
        `)
        .eq('id', articleId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!articleId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: ArticleStatus }) => {
      const { error } = await supabase
        .from('articles')
        .update({ status })
        .eq('id', articleId!);
      if (error) throw error;

      const notifyStatuses: ArticleStatus[] = ['under_review', 'manuscript_accepted', 'pending_fee', 'rejected'];
      if (notifyStatuses.includes(status) && article) {
        const authorProfile = article.profiles as any;
        if (authorProfile?.email) {
          try {
            await supabase.functions.invoke('send-email', {
              body: {
                to: authorProfile.email,
                template: 'article-status-change',
                data: {
                  authorName: authorProfile.full_name || 'Author',
                  articleTitle: article.title,
                  referenceNumber: article.reference_number,
                  status,
                },
              },
            });
          } catch (emailError) {
            console.error('Failed to send status email:', emailError);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-article-detail', articleId] });
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
      toast.success('Article status updated');
    },
    onError: (error) => {
      toast.error('Failed to update status: ' + error.message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('generate-certificate', {
        body: {
          articleId: article!.id,
          volume: publishDetails.volume,
          issue: publishDetails.issue,
          pageNumber: publishDetails.pageNumber,
          year: publishDetails.year,
          publishedLink: publishDetails.publishedLink || null,
        },
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['admin-article-detail', articleId] });
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
      toast.success('Article published with certificate!');
      setIsPublishDialogOpen(false);
      setPublishDetails({ volume: '', issue: '', pageNumber: '', year: new Date().getFullYear().toString(), publishedLink: '' });

      try {
        const authorId = article!.author_id;
        const articleTitle = article!.title;
        const { data: referral } = await supabase
          .from('referrals')
          .select('*, referrer:profiles!referrals_referrer_id_fkey(email, full_name)')
          .eq('referred_id', authorId)
          .eq('status', 'rewarded')
          .order('rewarded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (referral && referral.referrer) {
          const referrerProfile = referral.referrer as any;
          const authorProfile = article!.profiles as any;

          await supabase.functions.invoke('send-email', {
            body: {
              to: referrerProfile.email,
              template: 'referral-reward',
              data: {
                referrerName: referrerProfile.full_name,
                referredName: authorProfile?.full_name || 'Author',
                referredEmail: authorProfile?.email,
                articleTitle,
                bonusDownloads: 2,
                rewardType: 'referrer',
              },
            },
          });

          if (authorProfile?.email) {
            await supabase.functions.invoke('send-email', {
              body: {
                to: authorProfile.email,
                template: 'referral-reward',
                data: {
                  referrerName: referrerProfile.full_name,
                  referredName: authorProfile.full_name,
                  articleTitle,
                  bonusDownloads: 2,
                  rewardType: 'referred',
                },
              },
            });
          }
        }
      } catch (emailError) {
        console.error('Failed to send referral emails:', emailError);
      }
    },
    onError: (error) => {
      toast.error('Failed to publish: ' + error.message);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async ({ fileType }: { fileType: string }) => {
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.url) window.open(data.url, '_blank');
    },
    onError: (error) => {
      toast.error('Failed to get download URL: ' + error.message);
    },
  });

  const sendReminderMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke('send-payment-reminder', {
        body: { articleId: article!.id },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Payment reminder sent (${data.remindersSent} email)`);
    },
    onError: (error) => {
      toast.error('Failed to send reminder: ' + error.message);
    },
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      under_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      manuscript_accepted: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      pending_fee: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      paid: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      published: 'bg-green-500/20 text-green-400 border-green-500/30',
      rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

  if (!article) {
    return (
      <DashboardLayout type="admin">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Article not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/articles')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Articles
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/articles')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Articles
          </Button>
          <h1 className="font-display text-2xl md:text-3xl font-bold gradient-text mb-1">{article.title}</h1>
          <p className="text-muted-foreground font-mono text-sm">Reference: {article.reference_number}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Author Details */}
            <GlassCard>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Author Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Full Name</label>
                  <p className="font-medium">{(article.profiles as any)?.full_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Email</label>
                  <p className="text-sm">{(article.profiles as any)?.email || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Country</label>
                  <p className="text-sm">{(article.profiles as any)?.country || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Affiliation</label>
                  <p className="text-sm">{(article.profiles as any)?.affiliation || 'N/A'}</p>
                </div>
              </div>
            </GlassCard>

            {/* Submission Details */}
            {(article.subject || article.country || article.reason_of_research || article.submission_target) && (
              <GlassCard>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Submission Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  {article.author_name && (
                    <div>
                      <label className="text-xs text-muted-foreground">Author Name (on article)</label>
                      <p className="text-sm">{article.author_name}</p>
                    </div>
                  )}
                  {article.country && (
                    <div>
                      <label className="text-xs text-muted-foreground">Article Country</label>
                      <p className="text-sm">{article.country}</p>
                    </div>
                  )}
                  {article.subject && (
                    <div>
                      <label className="text-xs text-muted-foreground">Subject</label>
                      <p className="text-sm">{article.subject}</p>
                    </div>
                  )}
                  {article.submission_target && (
                    <div>
                      <label className="text-xs text-muted-foreground">Submission Target</label>
                      <p className="text-sm">{article.submission_target}</p>
                    </div>
                  )}
                  {article.reason_of_research && (
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground">Reason of Research</label>
                      <p className="text-sm mt-1">{article.reason_of_research}</p>
                    </div>
                  )}
                </div>
              </GlassCard>
            )}

            {/* Abstract */}
            {article.abstract && (
              <GlassCard>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Abstract</h3>
                <p className="text-sm leading-relaxed">{article.abstract}</p>
              </GlassCard>
            )}

            {/* Keywords */}
            {article.keywords && article.keywords.length > 0 && (
              <GlassCard>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {article.keywords.map((keyword: string, i: number) => (
                    <span key={i} className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs">
                      {keyword}
                    </span>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Co-Authors */}
            {(article as any)?.co_authors?.length > 0 && (
              <GlassCard>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Co-Authors</h3>
                <div className="space-y-3">
                  {(article as any).co_authors.map((ca: any) => (
                    <div key={ca.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))]">
                      <div className="text-sm space-y-0.5">
                        <p className="font-medium">{ca.name}</p>
                        <p className="text-muted-foreground text-xs">{ca.email}</p>
                        {ca.affiliation && <p className="text-muted-foreground text-xs">{ca.affiliation}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {ca.co_author_certificates?.map((cert: any) => (
                          cert.certificate_url && (
                            <Button
                              key={cert.id}
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => window.open(cert.certificate_url, '_blank')}
                            >
                              <Download className="w-3 h-3 mr-1" /> Cert
                            </Button>
                          )
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Publication Details */}
            {article.status === 'published' && article.volume && (
              <GlassCard className="border-green-500/20">
                <h3 className="font-medium text-green-400 mb-3">Publication Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Volume:</span>
                    <p className="font-medium">{article.volume}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Issue:</span>
                    <p className="font-medium">{article.issue}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pages:</span>
                    <p className="font-medium">{article.page_number}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Year:</span>
                    <p className="font-medium">{article.publication_year}</p>
                  </div>
                </div>
                {article.published_link && (
                  <div className="mt-3 text-sm">
                    <span className="text-muted-foreground">Published Link:</span>
                    <a href={article.published_link} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline break-all">
                      {article.published_link}
                    </a>
                  </div>
                )}
              </GlassCard>
            )}
          </div>

          {/* Sidebar - Status & Actions */}
          <div className="space-y-6">
            <GlassCard>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Status</h3>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-block px-3 py-1.5 rounded-full text-sm border ${getStatusBadge(article.status || '')}`}>
                  {formatStatus(article.status || '')}
                </span>
                {article.publication_type === 'fast_track' && (
                  <span className="inline-block px-3 py-1.5 rounded-full text-sm border bg-purple-500/20 text-purple-400 border-purple-500/30">
                    ⚡ Fast Track
                  </span>
                )}
                {article.publication_type === 'fast_track' && (
                  <span className="inline-block px-3 py-1 rounded-full text-xs border bg-green-500/20 text-green-400 border-green-500/30">
                    ✅ Fee Paid
                  </span>
                )}
                {article.publication_type === 'normal' && (
                  <span className="inline-block px-3 py-1.5 rounded-full text-sm border bg-muted text-muted-foreground">
                    Normal
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Submitted: {new Date(article.created_at || '').toLocaleDateString()}
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Actions</h3>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatusMutation.mutate({ status: 'under_review' })}
                  disabled={updateStatusMutation.isPending}
                >
                  <Clock className="w-4 h-4 mr-2" /> Under Review
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-emerald-400 hover:text-emerald-300"
                  onClick={() => updateStatusMutation.mutate({ status: 'manuscript_accepted' })}
                  disabled={updateStatusMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" /> Manuscript Accepted
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-orange-400 hover:text-orange-300"
                  onClick={() => updateStatusMutation.mutate({ status: 'pending_fee' })}
                  disabled={updateStatusMutation.isPending}
                >
                  Pending Fee
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-green-400 hover:text-green-300"
                  onClick={() => setIsPublishDialogOpen(true)}
                  disabled={updateStatusMutation.isPending || article.status === 'published'}
                >
                  <CheckCircle className="w-4 h-4 mr-2" /> Publish
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => updateStatusMutation.mutate({ status: 'rejected' })}
                  disabled={updateStatusMutation.isPending}
                >
                  <XCircle className="w-4 h-4 mr-2" /> Reject
                </Button>
                {article.status === 'pending_fee' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-amber-400 hover:text-amber-300"
                    onClick={() => sendReminderMutation.mutate()}
                    disabled={sendReminderMutation.isPending}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {sendReminderMutation.isPending ? 'Sending...' : 'Send Payment Reminder'}
                  </Button>
                )}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Downloads</h3>
              <div className="flex flex-col gap-2">
                {article.document_url && (
                  <Button variant="outline" size="sm" onClick={() => downloadMutation.mutate({ fileType: 'document' })} disabled={downloadMutation.isPending}>
                    <Download className="w-4 h-4 mr-2" /> Document
                  </Button>
                )}
                {article.certificate_url && (
                  <Button variant="outline" size="sm" onClick={() => downloadMutation.mutate({ fileType: 'certificate' })} disabled={downloadMutation.isPending}>
                    <Award className="w-4 h-4 mr-2" /> Certificate
                  </Button>
                )}
                {article.review_report_url && (
                  <Button variant="outline" size="sm" onClick={() => downloadMutation.mutate({ fileType: 'review_report' })} disabled={downloadMutation.isPending}>
                    <FileText className="w-4 h-4 mr-2" /> Review Report
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/ai-review?articleId=${article.id}`)}>
                  <Brain className="w-4 h-4 mr-2" /> AI Review
                </Button>
              </div>
            </GlassCard>
          </div>
        </div>
      </motion.div>

      {/* Publish Dialog */}
      <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <DialogContent className="glass-card-strong">
          <DialogHeader>
            <DialogTitle className="gradient-text">Publish Article & Generate Certificate</DialogTitle>
            <DialogDescription>Enter the publication details for the certificate</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="volume">Volume</Label>
                <Input id="volume" placeholder="e.g., 11" value={publishDetails.volume} onChange={(e) => setPublishDetails(prev => ({ ...prev, volume: e.target.value }))} className="glass-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue">Issue</Label>
                <Input id="issue" placeholder="e.g., 12" value={publishDetails.issue} onChange={(e) => setPublishDetails(prev => ({ ...prev, issue: e.target.value }))} className="glass-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pageNumber">Page Number</Label>
                <Input id="pageNumber" placeholder="e.g., 30-32" value={publishDetails.pageNumber} onChange={(e) => setPublishDetails(prev => ({ ...prev, pageNumber: e.target.value }))} className="glass-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input id="year" placeholder="e.g., 2025" value={publishDetails.year} onChange={(e) => setPublishDetails(prev => ({ ...prev, year: e.target.value }))} className="glass-input" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="publishedLink">Published Article Link (optional)</Label>
              <Input id="publishedLink" placeholder="e.g., https://wwjmrd.com/vol11/issue12/article-1" value={publishDetails.publishedLink} onChange={(e) => setPublishDetails(prev => ({ ...prev, publishedLink: e.target.value }))} className="glass-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPublishDialogOpen(false)}>Cancel</Button>
            <Button className="gradient-primary" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending || !publishDetails.volume || !publishDetails.issue || !publishDetails.pageNumber || !publishDetails.year}>
              {publishMutation.isPending ? (<><GlassSpinner size="sm" className="mr-2" />Generating...</>) : (<><Award className="w-4 h-4 mr-2" />Publish & Generate Certificate</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
