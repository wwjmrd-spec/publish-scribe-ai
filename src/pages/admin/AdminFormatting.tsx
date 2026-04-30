import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Search,
  Wand2,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Info,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Edit,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { ArticleContentEditor } from '@/components/admin/ArticleContentEditor';

type FormattingStatus = 'pending' | 'formatting' | 'ready_for_review' | 'approved' | 'failed';

interface Suggestion {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'improvement';
}

export default function AdminFormatting() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: articles, isLoading } = useQuery({
    queryKey: ['admin-formatting-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*, profiles:author_id (full_name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const formatMutation = useMutation({
    mutationFn: async (articleId: string) => {
      const response = await supabase.functions.invoke('format-article', {
        body: { articleId },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-formatting-articles'] });
      toast.success('Article formatted! You can now edit and review it below.');
    },
    onError: (error) => {
      toast.error('Formatting failed: ' + error.message);
    },
  });

  const handleDownloadFormatted = async (
    articleId: string,
    fileName: string,
    fileType: 'formatted_document' | 'formatted_word' = 'formatted_document'
  ) => {
    try {
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType },
      });
      if (response.error || !response.data?.url) {
        toast.error('Failed to get download link');
        return;
      }
      const link = document.createElement('a');
      link.href = response.data.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = fileName || `formatted-article.${fileType === 'formatted_word' ? 'docx' : 'pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error('Failed to download formatted article');
    }
  };

  const filteredArticles = articles?.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.reference_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string | null) => {
    const s = (status || 'pending') as FormattingStatus;
    const config: Record<FormattingStatus, { icon: any; label: string; variant: string }> = {
      pending: { icon: Clock, label: 'Not Formatted', variant: 'secondary' },
      formatting: { icon: RefreshCw, label: 'Formatting...', variant: 'default' },
      ready_for_review: { icon: Edit, label: 'Ready to Edit & Review', variant: 'destructive' },
      approved: { icon: CheckCircle, label: 'Approved & Sent', variant: 'default' },
      failed: { icon: XCircle, label: 'Failed', variant: 'destructive' },
    };
    const c = config[s] || config.pending;
    const Icon = c.icon;
    return (
      <Badge variant={c.variant as any} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {c.label}
      </Badge>
    );
  };

  const getSuggestionIcon = (severity: string) => {
    switch (severity) {
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />;
      case 'improvement':
        return <Wand2 className="w-4 h-4 text-primary shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
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

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl gradient-primary flex items-center justify-center glow-purple shrink-0">
            <Wand2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-bold">Article Formatting</h1>
            <p className="text-muted-foreground text-sm sm:text-base truncate">
              AI-powered formatting → Edit like Word → Approve & Send Galley Proof
            </p>
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

      {/* Articles */}
      <div className="space-y-4">
        {filteredArticles?.map((article, index) => {
          const status = (article as any).formatting_status as FormattingStatus || 'pending';
          const suggestions: Suggestion[] = ((article as any).formatting_suggestions as Suggestion[]) || [];
          const formattedUrl = (article as any).formatted_document_url;
          const formattedDocxUrl = (article as any).formatted_docx_url;
          const formattedContent = (article as any).formatted_content as string | null;

          return (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <GlassCard>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Article Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold line-clamp-1">{article.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {article.reference_number} • {(article.profiles as any)?.full_name}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2">{getStatusBadge(status)}</div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {status !== 'formatting' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => formatMutation.mutate(article.id)}
                        disabled={formatMutation.isPending && formatMutation.variables === article.id}
                      >
                        {formatMutation.isPending && formatMutation.variables === article.id ? (
                          <>
                            <GlassSpinner size="sm" className="mr-2" />
                            Formatting...
                          </>
                        ) : status === 'pending' || status === 'failed' ? (
                          <>
                            <Wand2 className="w-4 h-4 mr-2" />
                            Format
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Re-format
                          </>
                        )}
                      </Button>
                    )}

                    {(status === 'ready_for_review' || status === 'approved') && formattedContent && (
                      <Button
                        variant={editingArticle === article.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEditingArticle(editingArticle === article.id ? null : article.id)}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        {editingArticle === article.id ? 'Close Editor' : 'Edit Article'}
                      </Button>
                    )}

                    {formattedUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadFormatted(article.id, formattedUrl, 'formatted_document')}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download PDF
                      </Button>
                    )}

                    {formattedDocxUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadFormatted(article.id, formattedDocxUrl, 'formatted_word')}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Word
                      </Button>
                    )}

                    {suggestions.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setExpandedArticle(expandedArticle === article.id ? null : article.id)
                        }
                      >
                        {expandedArticle === article.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Editor Panel */}
                {editingArticle === article.id && formattedContent && (
                  <ArticleContentEditor
                    articleId={article.id}
                    initialContent={formattedContent}
                    articleTitle={article.title}
                    referenceNumber={article.reference_number}
                    onClose={() => setEditingArticle(null)}
                  />
                )}

                {/* Suggestions (expanded) */}
                <Collapsible open={expandedArticle === article.id}>
                  <CollapsibleContent>
                    {suggestions.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-[hsl(var(--glass-border))]">
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <Info className="w-4 h-4 text-primary" />
                          AI Formatting Suggestions
                        </h4>
                        <div className="space-y-2">
                          {suggestions.map((s, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-3 p-3 rounded-lg bg-[hsl(var(--glass-bg))]"
                            >
                              {getSuggestionIcon(s.severity)}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium capitalize">{s.type.replace(/_/g, ' ')}</p>
                                <p className="text-sm text-muted-foreground">{s.message}</p>
                              </div>
                              <Badge
                                variant={
                                  s.severity === 'warning'
                                    ? 'destructive'
                                    : s.severity === 'improvement'
                                    ? 'default'
                                    : 'secondary'
                                }
                                className="shrink-0 text-xs"
                              >
                                {s.severity}
                              </Badge>
                            </div>
                          ))}
                        </div>
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
