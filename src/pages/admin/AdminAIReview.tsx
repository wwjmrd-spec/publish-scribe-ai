import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  Search,
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function AdminAIReview() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const selectedArticleId = searchParams.get('articleId');
  const queryClient = useQueryClient();

  // Fetch all articles
  const { data: articles, isLoading: articlesLoading } = useQuery({
    queryKey: ['admin-articles-for-review'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          profiles:author_id (full_name, email),
          article_reviews (*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // AI Review mutation
  const reviewMutation = useMutation({
    mutationFn: async (articleId: string) => {
      const response = await supabase.functions.invoke('ai-review', {
        body: { articleId },
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-articles-for-review'] });
      const msg = data?.documentReviewed
        ? 'AI review completed! Full document was analyzed.'
        : 'AI review completed (metadata only - no document found).';
      toast.success(msg);
    },
    onError: (error) => {
      toast.error('Review failed: ' + error.message);
    },
  });

  // Download review report
  const handleDownloadReport = async (articleId: string) => {
    try {
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType: 'review_report' },
      });

      if (response.error || !response.data?.url) {
        toast.error('Failed to get report download link');
        return;
      }

      // Use anchor element to trigger download instead of window.open (avoids popup blocker)
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

  const filteredArticles = articles?.filter(article =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.reference_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 border-green-500/30';
    if (score >= 60) return 'bg-yellow-500/20 border-yellow-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case 'accept':
        return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' };
      case 'minor_revisions':
        return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
      case 'major_revisions':
        return { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/20' };
      case 'reject':
        return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' };
      default:
        return { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted' };
    }
  };

  if (articlesLoading) {
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
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl gradient-primary flex items-center justify-center glow-purple shrink-0">
            <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-bold">AI Article Review</h1>
            <p className="text-muted-foreground text-sm sm:text-base truncate">Analyze articles using AI</p>
          </div>
        </div>
      </motion.div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search articles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 glass-input"
        />
      </div>

      {/* Articles List */}
      <div className="space-y-4">
        {filteredArticles?.map((article, index) => {
          const latestReview = article.article_reviews?.[0];
          const isSelected = selectedArticleId === article.id;

          return (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <GlassCard className={isSelected ? 'ring-2 ring-primary' : ''}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Article Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold line-clamp-1">{article.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {article.reference_number} • {(article.profiles as any)?.full_name}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Scores (if reviewed) */}
                  {latestReview && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`px-3 py-1 rounded-lg border ${getScoreBg(latestReview.overall_score || 0)}`}>
                        <span className="text-xs text-muted-foreground">Overall</span>
                        <p className={`text-lg font-bold ${getScoreColor(latestReview.overall_score || 0)}`}>
                          {latestReview.overall_score}%
                        </p>
                      </div>
                      {latestReview.detailed_feedback && (
                        (() => {
                          const feedback = latestReview.detailed_feedback as any;
                          const rec = getRecommendationBadge(feedback?.recommendation || '');
                          const Icon = rec.icon;
                          return (
                            <div className={`px-3 py-2 rounded-lg ${rec.bg} flex items-center gap-2`}>
                              <Icon className={`w-4 h-4 ${rec.color}`} />
                              <span className={`text-sm font-medium ${rec.color} capitalize`}>
                                {(feedback?.recommendation || '').replace('_', ' ')}
                              </span>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reviewMutation.mutate(article.id)}
                      disabled={reviewMutation.isPending && reviewMutation.variables === article.id}
                    >
                      {reviewMutation.isPending && reviewMutation.variables === article.id ? (
                        <>
                          <GlassSpinner size="sm" className="mr-2" />
                          Analyzing...
                        </>
                      ) : latestReview ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Re-analyze
                        </>
                      ) : (
                        <>
                          <Brain className="w-4 h-4 mr-2" />
                          Analyze
                        </>
                      )}
                    </Button>
                    {latestReview && article.review_report_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadReport(article.id)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Report
                      </Button>
                    )}
                    {latestReview && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedReview(expandedReview === article.id ? null : article.id)}
                      >
                        {expandedReview === article.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded Review Details */}
                <Collapsible open={expandedReview === article.id}>
                  <CollapsibleContent>
                    {latestReview && (
                      <div className="mt-6 pt-6 border-t border-[hsl(var(--glass-border))]">
                        {/* Score Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                          <div className={`p-4 rounded-lg border ${getScoreBg(latestReview.plagiarism_score || 0)}`}>
                            <p className="text-sm text-muted-foreground mb-1">Plagiarism</p>
                            <p className={`text-2xl font-bold ${getScoreColor(latestReview.plagiarism_score || 0)}`}>
                              {latestReview.plagiarism_score}%
                            </p>
                          </div>
                          <div className={`p-4 rounded-lg border ${getScoreBg(latestReview.grammar_score || 0)}`}>
                            <p className="text-sm text-muted-foreground mb-1">Grammar</p>
                            <p className={`text-2xl font-bold ${getScoreColor(latestReview.grammar_score || 0)}`}>
                              {latestReview.grammar_score}%
                            </p>
                          </div>
                          <div className={`p-4 rounded-lg border ${getScoreBg(latestReview.content_score || 0)}`}>
                            <p className="text-sm text-muted-foreground mb-1">Content</p>
                            <p className={`text-2xl font-bold ${getScoreColor(latestReview.content_score || 0)}`}>
                              {latestReview.content_score}%
                            </p>
                          </div>
                          <div className={`p-4 rounded-lg border ${getScoreBg(latestReview.overall_score || 0)}`}>
                            <p className="text-sm text-muted-foreground mb-1">Overall</p>
                            <p className={`text-2xl font-bold ${getScoreColor(latestReview.overall_score || 0)}`}>
                              {latestReview.overall_score}%
                            </p>
                          </div>
                        </div>

                        {/* Summary */}
                        {latestReview.summary && (
                          <div className="mb-4">
                            <h4 className="font-medium mb-2">Summary</h4>
                            <p className="text-sm text-muted-foreground p-3 rounded-lg bg-[hsl(var(--glass-bg))]">
                              {latestReview.summary}
                            </p>
                          </div>
                        )}

                        {/* Detailed Feedback */}
                        {latestReview.detailed_feedback && (
                          <div className="space-y-4">
                            {(() => {
                              const feedback = latestReview.detailed_feedback as any;
                              return (
                                <>
                                  {/* Plagiarism */}
                                  {feedback.plagiarism && (
                                    <div className="p-4 rounded-lg bg-[hsl(var(--glass-bg))]">
                                      <h5 className="font-medium mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                                        Plagiarism Assessment
                                      </h5>
                                      <p className="text-sm text-muted-foreground mb-2">{feedback.plagiarism.assessment}</p>
                                      {feedback.plagiarism.suggestions?.length > 0 && (
                                        <ul className="text-sm space-y-1">
                                          {feedback.plagiarism.suggestions.map((s: string, i: number) => (
                                            <li key={i} className="text-muted-foreground">• {s}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  )}

                                  {/* Grammar */}
                                  {feedback.grammar && (
                                    <div className="p-4 rounded-lg bg-[hsl(var(--glass-bg))]">
                                      <h5 className="font-medium mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-yellow-400" />
                                        Grammar & Structure
                                      </h5>
                                      <p className="text-sm text-muted-foreground mb-2">{feedback.grammar.assessment}</p>
                                      {feedback.grammar.issues?.length > 0 && (
                                        <div className="mb-2">
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Issues:</p>
                                          <ul className="text-sm space-y-1">
                                            {feedback.grammar.issues.map((issue: string, i: number) => (
                                              <li key={i} className="text-orange-400">• {issue}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {feedback.grammar.suggestions?.length > 0 && (
                                        <ul className="text-sm space-y-1">
                                          {feedback.grammar.suggestions.map((s: string, i: number) => (
                                            <li key={i} className="text-muted-foreground">• {s}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  )}

                                  {/* Content */}
                                  {feedback.content && (
                                    <div className="p-4 rounded-lg bg-[hsl(var(--glass-bg))]">
                                      <h5 className="font-medium mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-400" />
                                        Content Quality
                                      </h5>
                                      <p className="text-sm text-muted-foreground mb-2">{feedback.content.assessment}</p>
                                      {feedback.content.strengths?.length > 0 && (
                                        <div className="mb-2">
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Strengths:</p>
                                          <ul className="text-sm space-y-1">
                                            {feedback.content.strengths.map((s: string, i: number) => (
                                              <li key={i} className="text-green-400">• {s}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {feedback.content.weaknesses?.length > 0 && (
                                        <div className="mb-2">
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Weaknesses:</p>
                                          <ul className="text-sm space-y-1">
                                            {feedback.content.weaknesses.map((w: string, i: number) => (
                                              <li key={i} className="text-red-400">• {w}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {feedback.content.suggestions?.length > 0 && (
                                        <ul className="text-sm space-y-1">
                                          {feedback.content.suggestions.map((s: string, i: number) => (
                                            <li key={i} className="text-muted-foreground">• {s}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground mt-4">
                          Reviewed on {new Date(latestReview.reviewed_at || '').toLocaleString()}
                        </p>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </GlassCard>
            </motion.div>
          );
        })}

        {filteredArticles?.length === 0 && (
          <GlassCard className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No articles found</p>
          </GlassCard>
        )}
      </div>
    </DashboardLayout>
  );
}
