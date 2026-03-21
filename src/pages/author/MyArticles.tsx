import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription, incrementUsage } from '@/hooks/useSubscription';
import { toast } from 'sonner';
import {
  FileText,
  Eye,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Upload,
  Crown,
  Lock,
  Award,
  Ban,
} from 'lucide-react';
import { WithdrawArticleDialog } from '@/components/articles/WithdrawArticleDialog';
import { GalleyProofReviewSection } from '@/components/articles/GalleyProofReviewSection';

export default function MyArticles() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { subscription, isLoading: subLoading } = useSubscription();
  const [withdrawArticle, setWithdrawArticle] = React.useState<any>(null);

  const handleDownloadGalleyProof = async (articleId: string) => {
    try {
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType: 'formatted_document' },
      });
      if (response.error || !response.data?.url) {
        toast.error('Failed to get galley proof download link');
        return;
      }
      const link = document.createElement('a');
      link.href = response.data.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = `galley-proof-${articleId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error('Failed to download galley proof');
    }
  };

  const handleDownloadReport = async (articleId: string) => {
    if (!user) return;

    if (!subscription.canDownloadReport) {
      toast.error(
        subscription.plan === 'free'
          ? `You've used all ${subscription.reviewReportsLimit} free review report downloads. Upgrade to Pro for more.`
          : `Monthly limit reached (${subscription.reviewReportsLimit} review reports/month).`
      );
      return;
    }

    try {
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType: 'review_report' },
      });

      if (response.error || !response.data?.url) {
        toast.error('Failed to get report download link');
        return;
      }

      // Increment usage
      await incrementUsage(user.id, 'review_reports_used');
      queryClient.invalidateQueries({ queryKey: ['plan-usage'] });

      const link = document.createElement('a');
      link.href = response.data.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = `review-report-${articleId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      toast.error('Failed to download report');
    }
  };

  const { data: articles, isLoading } = useQuery({
    queryKey: ['my-articles', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          co_authors (*)
        `)
        .eq('author_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Clock className="w-4 h-4" />;
      case 'under_review':
        return <Eye className="w-4 h-4" />;
      case 'manuscript_accepted':
        return <CheckCircle className="w-4 h-4" />;
      case 'pending_fee':
        return <AlertCircle className="w-4 h-4" />;
      case 'paid':
      case 'published':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      case 'withdrawn':
        return <Ban className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      submitted: 'status-submitted',
      under_review: 'status-under-review',
      manuscript_accepted: 'status-published',
      pending_fee: 'status-pending-fee',
      paid: 'status-published',
      payment_under_review: 'status-under-review',
      failed_payment: 'status-rejected',
      published: 'status-published',
      rejected: 'status-rejected',
      withdrawn: 'status-rejected',
    };
    return statusMap[status] || 'status-submitted';
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading || subLoading) {
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">My Articles</h1>
            <p className="text-muted-foreground">
              View and manage all your submitted articles
            </p>
          </div>
          <Button
            onClick={() => navigate('/author/submit')}
            className="w-full sm:w-auto gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
          >
            <Upload className="w-4 h-4 mr-2" />
            Submit New
          </Button>
        </div>

        {/* Plan Usage Info */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="w-4 h-4" />
            <span>
              Review reports: {subscription.reviewReportsUsed}/{subscription.reviewReportsLimit} used
              {subscription.plan === 'free' && ' (Free plan — lifetime limit)'}
              {subscription.plan === 'pro' && ' this month (Pro plan)'}
            </span>
          </div>
          {subscription.plan === 'free' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/author/subscription')}
              className="text-primary"
            >
              <Crown className="w-4 h-4 mr-1" />
              Upgrade
            </Button>
          )}
        </div>

        {/* Articles List */}
        {articles?.length === 0 ? (
          <GlassCard className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              No articles yet
            </h3>
            <p className="text-muted-foreground mb-6">
              Start your publication journey by submitting your first article
            </p>
            <Button
              onClick={() => navigate('/author/submit')}
              className="gradient-primary"
            >
              Submit Your First Article
            </Button>
          </GlassCard>
        ) : (
          <div className="space-y-4">
            {articles?.map((article, index) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <GlassCard className="hover-glow-cyan">
                  <div className="flex flex-col gap-4">
                    {/* Top: Icon + Title + Status */}
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                        {getStatusIcon(article.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{article.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {article.reference_number}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                        {article.status === 'pending_fee' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            ✅ Manuscript Accepted
                          </span>
                        )}
                        <span className={getStatusBadge(article.status)}>
                          {formatStatus(article.status)}
                        </span>
                      </div>
                    </div>

                    {/* Abstract */}
                    {article.abstract && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {article.abstract}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span>Submitted: {formatDate(article.created_at)}</span>
                      {article.publication_type === 'fast_track' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          ⚡ Fast Track (24hr)
                        </span>
                      )}
                      {article.co_authors && article.co_authors.length > 0 && (
                        <span>Co-authors: {article.co_authors.length}</span>
                      )}
                      {article.keywords && article.keywords.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {article.keywords.slice(0, 3).map((kw: string, i: number) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-full bg-[hsl(var(--glass-bg-strong))] text-xs"
                            >
                              {kw}
                            </span>
                          ))}
                          {article.keywords.length > 3 && (
                            <span className="text-xs">
                              +{article.keywords.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                      {article.review_report_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadReport(article.id)}
                          disabled={!subscription.canDownloadReport}
                        >
                          {!subscription.canDownloadReport ? (
                            <Lock className="w-4 h-4 mr-1" />
                          ) : (
                            <Download className="w-4 h-4 mr-1" />
                          )}
                          Report
                        </Button>
                      )}
                      {(article as any).formatted_document_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadGalleyProof(article.id)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Galley Proof
                        </Button>
                      )}
                      {article.certificate_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate('/author/certificates')}
                        >
                          <Award className="w-4 h-4 mr-1" />
                          Certificate
                        </Button>
                      )}
                      {article.status === 'pending_fee' && (
                        <Button
                          size="sm"
                          className="gradient-primary ml-auto"
                          onClick={() => navigate('/author/cart')}
                        >
                          Pay Now
                        </Button>
                      )}
                      {article.status === 'rejected' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate('/author/resubmit', { state: { resubmit: article } })}
                        >
                          <Upload className="w-4 h-4 mr-1" />
                          Resubmit
                        </Button>
                      )}
                      {article.status && !['withdrawn', 'rejected', 'published'].includes(article.status) && (article as any).allow_withdrawal && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive ml-auto"
                          onClick={() => setWithdrawArticle(article)}
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {withdrawArticle && (
        <WithdrawArticleDialog
          open={!!withdrawArticle}
          onOpenChange={(open) => !open && setWithdrawArticle(null)}
          article={withdrawArticle}
        />
      )}
    </DashboardLayout>
  );
}
