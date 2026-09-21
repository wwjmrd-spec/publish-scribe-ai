import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  FileText, 
  Search, 
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Download,
  Brain,
  Award,
  Mail,
  RotateCcw,
  Zap,
  IndianRupee,
  MoreHorizontal,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { useNavigate } from 'react-router-dom';
import { formatArticleStatus, getArticleStatusBadgeClass } from '@/lib/articleStatus';
import { SimplePager } from '@/components/ui/SimplePager';
import { queryTimeout } from '@/lib/queryTimeout';

const PAGE_SIZE = 10;

type ArticleStatus = Database['public']['Enums']['article_status'];

export default function AdminArticles() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  React.useEffect(() => { setPage(1); }, [searchQuery, statusFilter]);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishDetails, setPublishDetails] = useState({
    volume: '',
    issue: '',
    pageNumber: '',
    year: new Date().getFullYear().toString(),
    publishedLink: '',
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkFeeReminderMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) throw new Error('No articles selected');
      const results = await Promise.allSettled(
        ids.map(id =>
          supabase.functions.invoke('send-payment-reminder', {
            body: { articleId: id, force: true },
          })
        )
      );
      const failed = results.filter(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any)?.error)
      );
      return { total: ids.length, failed: failed.length };
    },
    onSuccess: ({ total, failed }) => {
      if (failed === 0) toast.success(`Fee reminders sent to ${total} author(s)`);
      else toast.warning(`Fee reminders sent to ${total - failed} of ${total} (${failed} failed)`);
    },
    onError: (err: any) => toast.error('Bulk reminder failed: ' + err.message),
  });

  const bulkRevisionMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) throw new Error('No articles selected');
      const results = await Promise.allSettled(
        ids.map(id =>
          supabase.functions.invoke('request-manuscript-revision', { body: { articleId: id } })
        )
      );
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any)?.error));
      return { total: ids.length, failed: failed.length };
    },
    onSuccess: ({ total, failed }) => {
      if (failed === 0) toast.success(`Revision requested for ${total} article(s)`);
      else toast.warning(`Revision requested for ${total - failed} of ${total} (${failed} failed)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
    },
    onError: (err: any) => toast.error('Bulk revision failed: ' + err.message),
  });

  const { data: articles, isLoading } = useQuery({
    queryKey: ['admin-articles', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('articles')
        .select(`
          id, author_id, reference_number, title, status, created_at, publication_type,
          document_url, certificate_url, review_report_url,
          profiles:author_id (full_name, email, country, affiliation),
          co_authors (id, first_name, last_name, name, email, affiliation, co_author_certificates (id, certificate_url, payment_status))
        `)
        .order('created_at', { ascending: false });
      
      if (statusFilter !== 'all') {
       query = query.eq('status', statusFilter as ArticleStatus);
      }
      
      const { data, error } = await query.abortSignal(queryTimeout());
      if (error) throw error;
      return data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ articleId, status, article }: { articleId: string; status: ArticleStatus; article?: any }) => {
      const { error } = await supabase
        .from('articles')
        .update({ status })
        .eq('id', articleId);
      
      if (error) throw error;
      if (status === 'paid') {
        const result = await supabase.functions.invoke('format-article', { body: { articleId } });
        if (result.error || result.data?.error) {
          throw new Error(result.data?.error || result.error?.message || 'Formatting could not start');
        }
      }

      // Send email notification for specific status changes
      const notifyStatuses: ArticleStatus[] = ['under_review', 'pending_fee', 'rejected'];
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
            console.log(`Status change email sent to ${authorProfile.email} for status: ${status}`);
          } catch (emailError) {
            console.error('Failed to send status email (non-critical):', emailError);
          }
        }
      }
    },
    onSuccess: () => {
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
          articleId: selectedArticle.id,
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
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
      toast.success('Article published with certificate!');
      setIsPublishDialogOpen(false);
      
      setPublishDetails({ volume: '', issue: '', pageNumber: '', year: new Date().getFullYear().toString(), publishedLink: '' });

      // Send referral reward emails in the background
      try {
        const authorId = selectedArticle.author_id;
        const articleTitle = selectedArticle.title;

        // Check if there's a referral for this author
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
          const authorProfile = (selectedArticle.profiles as any);

          // Send email to referrer
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

          // Send email to referred author
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

          console.log('Referral reward emails sent successfully');
        }
      } catch (emailError) {
        console.error('Failed to send referral emails (non-critical):', emailError);
      }
    },
    onError: (error) => {
      toast.error('Failed to publish: ' + error.message);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async ({ articleId, fileType }: { articleId: string; fileType: string }) => {
      const tid = toast.loading('Preparing file…');
      try {
        const response = await supabase.functions.invoke('get-document-url', {
          body: { articleId, fileType },
        });
        if (response.error) throw new Error(response.error.message);
        toast.success('File ready', { id: tid });
        return response.data;
      } catch (e) {
        toast.dismiss(tid);
        throw e;
      }
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, '_blank');
      }
    },
    onError: (error) => {
      toast.error('Failed to get download URL: ' + error.message);
    },
  });

  const togglePublicationTypeMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: 'normal' | 'fast_track' }) => {
      const { error } = await supabase.from('articles').update({ publication_type: type }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
      toast.success(type === 'fast_track' ? 'Marked as Fast Track' : 'Removed Fast Track');
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const fileNotReadableMutation = useMutation({
    mutationFn: async (article: any) => {
      const profile = article.profiles as any;
      const to = profile?.email;
      if (!to) throw new Error('This author has no email address on file');
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to,
          template: 'file-not-readable',
          data: {
            authorName: profile?.full_name || 'Author',
            authorEmail: to,
            articleTitle: article.title,
            referenceNumber: article.reference_number,
            articleId: article.id,
            fileName: String(article.document_url || '').split('/').pop() || '',
          },
        },
      });
      if (error) throw error;
      await supabase.from('notifications').insert({
        user_id: article.author_id,
        title: 'Manuscript file not readable ⚠️',
        message: `The file uploaded for "${article.title}" (${article.reference_number}) could not be opened by our system. Please upload your manuscript again as a .docx file from My Articles.`,
        type: 'warning',
        link: '/author/articles',
      });
    },
    onSuccess: () => toast.success('Re-submission request emailed to the author'),
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase
        .from('articles')
        .update({ status: (paid ? 'paid' : 'pending_fee') as ArticleStatus })
        .eq('id', id);
      if (error) throw error;
      if (paid) {
        const result = await supabase.functions.invoke('format-article', { body: { articleId: id } });
        if (result.error || result.data?.error) {
          throw new Error(result.data?.error || result.error?.message || 'Formatting could not start');
        }
      }
    },
    onSuccess: (_, { paid }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
      toast.success(paid ? 'Marked as Paid' : 'Marked as Pending Fee');
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const filteredArticles = articles?.filter(article =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.reference_number.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalArticles = filteredArticles?.length || 0;
  const pagedArticles = filteredArticles?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) || [];

  const getStatusBadge = (status: string) => getArticleStatusBadgeClass(status);
  const formatStatus = (status: string) => formatArticleStatus(status);

  const handlePublishClick = () => {
    setIsPublishDialogOpen(true);
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-display text-3xl font-bold mb-2">Manage Articles</h1>
        <p className="text-muted-foreground">Review and manage article submissions</p>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 glass-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 glass-input">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="copyright_received">Copyright Received</SelectItem>
            <SelectItem value="ai_review_generated">AI Review Generated</SelectItem>
            <SelectItem value="manuscript_accepted">Manuscript Accepted</SelectItem>
            <SelectItem value="revision_requested">Revision Requested</SelectItem>
            <SelectItem value="revised_submitted">Revised Submitted</SelectItem>
            <SelectItem value="revised_review_generated">Revised Review Generated</SelectItem>
            <SelectItem value="pending_fee">Pending Fee</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="galley_proof_sent">Galley Proof Sent</SelectItem>
            <SelectItem value="galley_proof_approved">Galley Proof Approved</SelectItem>
            <SelectItem value="galley_proof_revised">Galley Proof Revised</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button
          size="sm"
          variant="outline"
          className="text-amber-400 hover:text-amber-300"
          onClick={() => {
            if (selectedIds.size === 0) { toast.error('Select articles first'); return; }
            if (!confirm(`Send fee reminder emails to ${selectedIds.size} selected article(s)?`)) return;
            bulkFeeReminderMutation.mutate();
          }}
          disabled={bulkFeeReminderMutation.isPending || selectedIds.size === 0}
        >
          <Mail className="w-4 h-4 mr-2" />
          {bulkFeeReminderMutation.isPending ? 'Sending…' : `Send Fee Reminders (${selectedIds.size})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-orange-400 hover:text-orange-300"
          onClick={() => {
            if (selectedIds.size === 0) { toast.error('Select articles first'); return; }
            if (!confirm(`Request manuscript revision for ${selectedIds.size} selected article(s)?`)) return;
            bulkRevisionMutation.mutate();
          }}
          disabled={bulkRevisionMutation.isPending || selectedIds.size === 0}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          {bulkRevisionMutation.isPending ? 'Requesting…' : `Request Revision (${selectedIds.size})`}
        </Button>
        {selectedIds.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        )}
      </div>

      {/* Articles Table */}
      <GlassCard>
        {!filteredArticles?.length ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No articles found</p>
          </div>
        ) : (
          <div>
            {/* Mobile cards */}
            <div className="space-y-3 sm:hidden">
              {pagedArticles.map((article) => (
                <div
                  key={article.id}
                  className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))] space-y-2 cursor-pointer"
                  onClick={() => navigate(`/admin/articles/${article.id}`)}
                >
                    <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{article.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{(article.profiles as any)?.full_name || 'Unknown'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] border whitespace-nowrap ${getStatusBadge(article.status || '')}`}>
                        {formatStatus(article.status || '')}
                      </span>
                      {article.publication_type === 'fast_track' && (
                        <>
                          <span className="px-2 py-0.5 rounded-full text-[11px] border whitespace-nowrap bg-purple-500/20 text-purple-400 border-purple-500/30">
                            ⚡ Fast Track
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] border whitespace-nowrap bg-green-500/20 text-green-400 border-green-500/30">
                            ✅ Paid
                          </span>
                         </>
                       )}
                       {(article as any).created_via === 'ai_writer' && (
                         <span className="px-2 py-0.5 rounded-full text-[11px] border whitespace-nowrap bg-gradient-to-r from-glow-cyan/20 via-glow-purple/20 to-glow-pink/20 text-primary border-primary/30">
                           ✨ AI Writer
                         </span>
                       )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{article.reference_number}</span>
                    <div className="flex items-center gap-2">
                      {(article as any).page_count && (
                        <span>📄 {(article as any).page_count}pg</span>
                      )}
                      <span>{new Date(article.created_at || '').toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[hsl(var(--glass-border))]">
                    <th className="py-3 px-2 w-10">
                      <Checkbox
                        checked={pagedArticles.length > 0 && pagedArticles.every(a => selectedIds.has(a.id))}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedIds(new Set([...Array.from(selectedIds), ...pagedArticles.map(a => a.id)]));
                          else setSelectedIds(new Set(Array.from(selectedIds).filter(id => !pagedArticles.some(a => a.id === id))));
                        }}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Reference</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Title</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Author</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Pages</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedArticles.map((article) => (
                    <tr key={article.id} className="border-b border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors">
                      <td className="py-3 px-2 text-center">
                        <Checkbox
                          checked={selectedIds.has(article.id)}
                          onCheckedChange={() => toggleSelect(article.id)}
                          aria-label={`Select ${article.reference_number}`}
                        />
                      </td>
                      <td className="py-3 px-4 font-mono text-sm">{article.reference_number}</td>
                      <td className="py-3 px-4 max-w-[200px] truncate">{article.title}</td>
                      <td className="py-3 px-4 text-sm">
                        {(article.profiles as any)?.full_name || 'Unknown'}
                      </td>
                      <td className="py-3 px-4 text-sm text-center">
                        {(article as any).page_count ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-muted">{(article as any).page_count}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs border whitespace-nowrap ${getStatusBadge(article.status || '')}`}>
                            {formatStatus(article.status || '')}
                          </span>
                          {article.publication_type === 'fast_track' && (
                            <>
                              <span className="px-2 py-1 rounded-full text-xs border whitespace-nowrap bg-purple-500/20 text-purple-400 border-purple-500/30">
                                ⚡ Fast Track
                              </span>
                              <span className="px-2 py-1 rounded-full text-xs border whitespace-nowrap bg-green-500/20 text-green-400 border-green-500/30">
                                ✅ Paid
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {new Date(article.created_at || '').toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => navigate(`/admin/articles/${article.id}`)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/admin/ai-review?articleId=${article.id}`)}>
                              <Brain className="w-4 h-4 mr-2" />
                              AI Review
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-amber-400"
                              onClick={() => {
                                if (!confirm('Email the author that this manuscript file is not readable and ask them to upload it again as a .docx file?')) return;
                                fileNotReadableMutation.mutate(article);
                              }}
                              disabled={fileNotReadableMutation.isPending}
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              File Not Readable — Ask to Resubmit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => togglePublicationTypeMutation.mutate({
                                id: article.id,
                                type: article.publication_type === 'fast_track' ? 'normal' : 'fast_track',
                              })}
                              disabled={togglePublicationTypeMutation.isPending}
                            >
                              <Zap className="w-4 h-4 mr-2" />
                              {article.publication_type === 'fast_track' ? 'Remove Fast Track' : 'Mark Fast Track'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => markPaidMutation.mutate({
                                id: article.id,
                                paid: article.status !== 'paid',
                              })}
                              disabled={markPaidMutation.isPending}
                            >
                              <IndianRupee className="w-4 h-4 mr-2" />
                              {article.status === 'paid' ? 'Unmark Paid' : 'Mark as Paid'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {article.document_url && (
                              <DropdownMenuItem onClick={() => downloadMutation.mutate({ articleId: article.id, fileType: 'document' })} disabled={downloadMutation.isPending}>
                                <Download className="w-4 h-4 mr-2" />
                                Download Document
                              </DropdownMenuItem>
                            )}
                            {article.certificate_url && (
                              <DropdownMenuItem onClick={() => downloadMutation.mutate({ articleId: article.id, fileType: 'certificate' })} disabled={downloadMutation.isPending}>
                                <Award className="w-4 h-4 mr-2" />
                                Download Certificate
                              </DropdownMenuItem>
                            )}
                            {article.review_report_url && (
                              <DropdownMenuItem onClick={() => downloadMutation.mutate({ articleId: article.id, fileType: 'review_report' })} disabled={downloadMutation.isPending}>
                                <FileText className="w-4 h-4 mr-2" />
                                Download Review Report
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SimplePager page={page} pageSize={PAGE_SIZE} total={totalArticles} onPageChange={setPage} />
          </div>
        )}
      </GlassCard>

      {/* Publish Dialog with Certificate Details */}
      <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <DialogContent className="glass-card-strong">
          <DialogHeader>
            <DialogTitle className="gradient-text">Publish Article & Generate Certificate</DialogTitle>
            <DialogDescription>
              Enter the publication details for the certificate
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="volume">Volume</Label>
                <Input
                  id="volume"
                  placeholder="e.g., 11"
                  value={publishDetails.volume}
                  onChange={(e) => setPublishDetails(prev => ({ ...prev, volume: e.target.value }))}
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue">Issue</Label>
                <Input
                  id="issue"
                  placeholder="e.g., 12"
                  value={publishDetails.issue}
                  onChange={(e) => setPublishDetails(prev => ({ ...prev, issue: e.target.value }))}
                  className="glass-input"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pageNumber">Page Number</Label>
                <Input
                  id="pageNumber"
                  placeholder="e.g., 30-32"
                  value={publishDetails.pageNumber}
                  onChange={(e) => setPublishDetails(prev => ({ ...prev, pageNumber: e.target.value }))}
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  placeholder="e.g., 2025"
                  value={publishDetails.year}
                  onChange={(e) => setPublishDetails(prev => ({ ...prev, year: e.target.value }))}
                  className="glass-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="publishedLink">Published Article Link (optional)</Label>
              <Input
                id="publishedLink"
                placeholder="e.g., https://wwjmrd.com/vol11/issue12/article-1"
                value={publishDetails.publishedLink}
                onChange={(e) => setPublishDetails(prev => ({ ...prev, publishedLink: e.target.value }))}
                className="glass-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPublishDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gradient-primary"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !publishDetails.volume || !publishDetails.issue || !publishDetails.pageNumber || !publishDetails.year}
            >
              {publishMutation.isPending ? (
                <>
                  <GlassSpinner size="sm" className="mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Award className="w-4 h-4 mr-2" />
                  Publish & Generate Certificate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
