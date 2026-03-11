import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Users, 
  DollarSign, 
  CheckCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
  Eye,
  IndianRupee,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useNavigate } from 'react-router-dom';
import { WeeklyReport } from '@/components/admin/WeeklyReport';

export default function AdminDashboard() {
  const navigate = useNavigate();

  const { data: articles, isLoading: articlesLoading } = useQuery({
    queryKey: ['admin-articles-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['admin-profiles-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, created_at');
      
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ['admin-payments-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('payment_status', 'success');
      
      if (error) throw error;
      return data;
    },
  });

  const stats = React.useMemo(() => {
    const totalArticles = articles?.length || 0;
    const pendingReview = articles?.filter(a => a.status === 'submitted').length || 0;
    const underReview = articles?.filter(a => a.status === 'under_review').length || 0;
    const published = articles?.filter(a => a.status === 'published').length || 0;
    const totalAuthors = profiles?.length || 0;
    
    const totalRevenue = payments?.reduce((sum, p) => {
      if (p.currency === 'USD') {
        return sum + (Number(p.final_amount) * 83); // Convert USD to INR approx
      }
      return sum + Number(p.final_amount);
    }, 0) || 0;

    return {
      totalArticles,
      pendingReview,
      underReview,
      published,
      totalAuthors,
      totalRevenue,
    };
  }, [articles, profiles, payments]);

  const recentArticles = articles?.slice(0, 5) || [];

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      submitted: 'status-submitted',
      under_review: 'status-under-review',
      pending_fee: 'status-pending-fee',
      published: 'status-published',
      rejected: 'status-rejected',
    };
    return statusMap[status] || 'status-submitted';
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const isLoading = articlesLoading || profilesLoading;

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
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-display text-3xl font-bold mb-2">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground">
          Manage articles, authors, and system settings
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard className="hover-glow-cyan cursor-pointer" onClick={() => navigate('/admin/articles')}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Articles</p>
                <p className="text-2xl font-bold">{stats.totalArticles}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <GlassCard className="hover-glow-purple cursor-pointer" onClick={() => navigate('/admin/authors')}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Authors</p>
                <p className="text-2xl font-bold">{stats.totalAuthors}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard className="hover-glow-cyan cursor-pointer" onClick={() => navigate('/admin/articles')}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold">{stats.pendingReview}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <GlassCard className="hover-glow-cyan cursor-pointer" onClick={() => navigate('/admin/fees')}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Revenue (₹)</p>
                <p className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassCard className="h-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <h2 className="font-display text-xl font-semibold">Pending Actions</h2>
            </div>
            <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 rounded-lg bg-[hsl(var(--glass-bg))] cursor-pointer hover:bg-[hsl(var(--glass-bg-strong))] transition-colors" onClick={() => navigate('/admin/articles')}>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                  <span className="text-sm sm:text-base truncate">Articles awaiting review</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xl sm:text-2xl font-bold">{stats.pendingReview}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 sm:p-4 rounded-lg bg-[hsl(var(--glass-bg))] cursor-pointer hover:bg-[hsl(var(--glass-bg-strong))] transition-colors" onClick={() => navigate('/admin/ai-review')}>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-secondary shrink-0" />
                  <span className="text-sm sm:text-base truncate">Under AI review</span>
                </div>
                <span className="text-xl sm:text-2xl font-bold shrink-0">{stats.underReview}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 sm:p-4 rounded-lg bg-[hsl(var(--glass-bg))] cursor-pointer hover:bg-[hsl(var(--glass-bg-strong))] transition-colors" onClick={() => navigate('/admin/articles')}>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0" />
                  <span className="text-sm sm:text-base truncate">Published articles</span>
                </div>
                <span className="text-xl sm:text-2xl font-bold shrink-0">{stats.published}</span>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <GlassCard className="h-full">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-primary" />
              <h2 className="font-display text-xl font-semibold">Quick Stats</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 text-center">
                <p className="text-3xl font-bold gradient-text">
                  {((stats.published / (stats.totalArticles || 1)) * 100).toFixed(0)}%
                </p>
                <p className="text-sm text-muted-foreground mt-1">Publication Rate</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-secondary/10 to-secondary/5 text-center">
                <p className="text-3xl font-bold text-secondary">
                  {(stats.totalArticles / (stats.totalAuthors || 1)).toFixed(1)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Avg per Author</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Weekly Report */}
      <div className="mb-8">
        <WeeklyReport />
      </div>

      {/* Recent Articles */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold">Recent Submissions</h2>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/admin/articles')}
            >
              View All
            </Button>
          </div>

          {recentArticles.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No articles submitted yet</p>
            </div>
          ) : (
            <div>
              <div className="space-y-3 sm:hidden">
                {recentArticles.map((article) => (
                  <div key={article.id} className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm truncate flex-1">{article.title}</p>
                      <span className={`${getStatusBadge(article.status)} shrink-0 whitespace-nowrap`}>
                        {formatStatus(article.status)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{article.reference_number}</span>
                      <span>{new Date(article.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[hsl(var(--glass-border))]">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Reference</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Title</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentArticles.map((article) => (
                      <tr key={article.id} className="border-b border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors">
                        <td className="py-3 px-4 font-mono text-sm">{article.reference_number}</td>
                        <td className="py-3 px-4 max-w-[200px] truncate">{article.title}</td>
                        <td className="py-3 px-4">
                          <span className={getStatusBadge(article.status)}>
                            {formatStatus(article.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {new Date(article.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </DashboardLayout>
  );
}
