import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText,
  Eye,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Upload,
} from 'lucide-react';

export default function MyArticles() {
  const { user } = useAuth();
  const navigate = useNavigate();

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
      case 'pending_fee':
        return <AlertCircle className="w-4 h-4" />;
      case 'paid':
      case 'published':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      submitted: 'status-submitted',
      under_review: 'status-under-review',
      pending_fee: 'status-pending-fee',
      paid: 'status-published',
      payment_under_review: 'status-under-review',
      failed_payment: 'status-rejected',
      published: 'status-published',
      rejected: 'status-rejected',
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">My Articles</h1>
            <p className="text-muted-foreground">
              View and manage all your submitted articles
            </p>
          </div>
          <Button
            onClick={() => navigate('/author/submit')}
            className="gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
          >
            <Upload className="w-4 h-4 mr-2" />
            Submit New
          </Button>
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
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Article Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                          {getStatusIcon(article.status)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{article.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {article.reference_number}
                          </p>
                        </div>
                      </div>

                      {article.abstract && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {article.abstract}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span>Submitted: {formatDate(article.created_at)}</span>
                        {article.co_authors && article.co_authors.length > 0 && (
                          <span>
                            Co-authors: {article.co_authors.length}
                          </span>
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
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-4 lg:flex-shrink-0">
                      <span className={getStatusBadge(article.status)}>
                        {formatStatus(article.status)}
                      </span>

                      <div className="flex gap-2">
                        {article.review_report_url && (
                          <Button variant="outline" size="sm">
                            <Download className="w-4 h-4 mr-1" />
                            Report
                          </Button>
                        )}
                        {article.certificate_url && (
                          <Button variant="outline" size="sm">
                            <Download className="w-4 h-4 mr-1" />
                            Certificate
                          </Button>
                        )}
                        {article.status === 'pending_fee' && (
                          <Button
                            size="sm"
                            className="gradient-primary"
                            onClick={() => navigate('/author/cart')}
                          >
                            Pay Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
