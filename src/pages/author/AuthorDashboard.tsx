import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Upload, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  ShoppingCart,
  Award,
  TrendingUp,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { PlanLimitsCard } from '@/components/dashboard/PlanLimitsCard';

export default function AuthorDashboard() {
  const { user, isIndian } = useAuth();
  const navigate = useNavigate();

  const { data: articles, isLoading } = useQuery({
    queryKey: ['author-articles', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('author_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const stats = React.useMemo(() => {
    if (!articles) return { total: 0, submitted: 0, pendingPayment: 0, published: 0 };
    
    return {
      total: articles.length,
      submitted: articles.filter(a => a.status === 'submitted').length,
      pendingPayment: articles.filter(a => a.status === 'pending_fee').length,
      published: articles.filter(a => a.status === 'published').length,
    };
  }, [articles]);

  const recentArticles = articles?.slice(0, 5) || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Clock className="w-4 h-4 text-primary" />;
      case 'under_review':
        return <Clock className="w-4 h-4 text-secondary" />;
      case 'manuscript_accepted':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'pending_fee':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'published':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      submitted: 'status-submitted',
      under_review: 'status-under-review',
      manuscript_accepted: 'status-published',
      pending_fee: 'status-pending-fee',
      published: 'status-published',
      rejected: 'status-rejected',
    };
    return statusMap[status] || 'status-submitted';
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-display text-3xl font-bold mb-2">
          Welcome back! 👋
        </h1>
        <p className="text-muted-foreground">
          Here's an overview of your article submissions
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard className="hover-glow-cyan cursor-pointer" onClick={() => navigate('/author/articles')}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Articles</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <GlassCard className="hover-glow-purple cursor-pointer" onClick={() => navigate('/author/articles')}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="text-2xl font-bold">{stats.submitted}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard className="hover-glow-cyan cursor-pointer" onClick={() => navigate('/author/cart')}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Payment</p>
                <p className="text-2xl font-bold">{stats.pendingPayment}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <GlassCard className="hover-glow-cyan">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Published</p>
                <p className="text-2xl font-bold">{stats.published}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Plan Limits */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="mb-8"
      >
        <PlanLimitsCard />
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-8"
      >
        <GlassCard>
          <h2 className="font-display text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Button 
              onClick={() => navigate('/author/submit')}
              className="gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
            >
              <Upload className="w-4 h-4 mr-2" />
              Submit New Article
            </Button>
            {stats.pendingPayment > 0 && (
              <Button 
                variant="outline"
                onClick={() => navigate('/author/cart')}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Pay for Articles ({stats.pendingPayment})
              </Button>
            )}
            {stats.published > 0 && (
              <Button 
                variant="outline"
                onClick={() => navigate('/author/certificates')}
              >
                <Award className="w-4 h-4 mr-2" />
                Download Certificates
              </Button>
            )}
          </div>
        </GlassCard>
      </motion.div>

      {/* Recent Articles */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold">Recent Submissions</h2>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/author/articles')}
            >
              View All
            </Button>
          </div>

          {recentArticles.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4">No articles submitted yet</p>
              <Button 
                onClick={() => navigate('/author/submit')}
                className="gradient-primary"
              >
                Submit Your First Article
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentArticles.map((article, index) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.05 }}
                  className="flex items-start sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-lg bg-[hsl(var(--glass-bg))] hover:bg-[hsl(var(--glass-bg-strong))] transition-all duration-300"
                >
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      {getStatusIcon(article.status)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm sm:text-base truncate">
                        {article.title}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {article.reference_number}
                      </p>
                    </div>
                  </div>
                  <span className={`${getStatusBadge(article.status)} shrink-0`}>
                    {formatStatus(article.status)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Currency Notice */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="w-4 h-4" />
          <span>
            All payments will be processed in {isIndian ? 'INR (₹)' : 'USD ($)'}
          </span>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
