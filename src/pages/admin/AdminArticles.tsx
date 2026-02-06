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
} from 'lucide-react';
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
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { useNavigate } from 'react-router-dom';

type ArticleStatus = Database['public']['Enums']['article_status'];

export default function AdminArticles() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
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

  const { data: articles, isLoading } = useQuery({
    queryKey: ['admin-articles', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('articles')
        .select(`
          *,
          profiles:author_id (full_name, email, country, affiliation)
        `)
        .order('created_at', { ascending: false });
      
      if (statusFilter !== 'all') {
       query = query.eq('status', statusFilter as ArticleStatus);
      }
      
      const { data, error } = await query;
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
      setIsViewDialogOpen(false);
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
      setIsViewDialogOpen(false);
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
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType },
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
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

  const filteredArticles = articles?.filter(article =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.reference_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      under_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
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
            <SelectItem value="pending_fee">Pending Fee</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Articles Table */}
      <GlassCard>
        {!filteredArticles?.length ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No articles found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[hsl(var(--glass-border))]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Reference</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Title</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Author</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.map((article) => (
                  <tr key={article.id} className="border-b border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors">
                    <td className="py-3 px-4 font-mono text-sm">{article.reference_number}</td>
                    <td className="py-3 px-4 max-w-[200px] truncate">{article.title}</td>
                    <td className="py-3 px-4 text-sm">
                      {(article.profiles as any)?.full_name || 'Unknown'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs border ${getStatusBadge(article.status || '')}`}>
                        {formatStatus(article.status || '')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {new Date(article.created_at || '').toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedArticle(article);
                            setIsViewDialogOpen(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/admin/ai-review?articleId=${article.id}`)}
                          title="AI Review"
                        >
                          <Brain className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* View/Edit Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="glass-card-strong max-w-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text">{selectedArticle?.title}</DialogTitle>
            <DialogDescription>Reference: {selectedArticle?.reference_number}</DialogDescription>
          </DialogHeader>
          
          {selectedArticle && (
            <div className="space-y-4">
              {/* Author Profile Details */}
              <div className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))]">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Author Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Full Name</label>
                    <p className="font-medium">{(selectedArticle.profiles as any)?.full_name || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Email</label>
                    <p className="text-sm">{(selectedArticle.profiles as any)?.email || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Country</label>
                    <p className="text-sm">{(selectedArticle.profiles as any)?.country || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Affiliation</label>
                    <p className="text-sm">{(selectedArticle.profiles as any)?.affiliation || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Current Status</label>
                <p className={`inline-block px-2 py-1 rounded-full text-xs border mt-1 ${getStatusBadge(selectedArticle.status)}`}>
                  {formatStatus(selectedArticle.status)}
                </p>
              </div>

              {/* Additional Article Details */}
              {(selectedArticle.subject || selectedArticle.country || selectedArticle.reason_of_research || selectedArticle.submission_target) && (
                <div className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))]">
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Submission Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedArticle.author_name && (
                      <div>
                        <label className="text-xs text-muted-foreground">Author Name (on article)</label>
                        <p className="text-sm">{selectedArticle.author_name}</p>
                      </div>
                    )}
                    {selectedArticle.country && (
                      <div>
                        <label className="text-xs text-muted-foreground">Article Country</label>
                        <p className="text-sm">{selectedArticle.country}</p>
                      </div>
                    )}
                    {selectedArticle.subject && (
                      <div>
                        <label className="text-xs text-muted-foreground">Subject</label>
                        <p className="text-sm">{selectedArticle.subject}</p>
                      </div>
                    )}
                    {selectedArticle.submission_target && (
                      <div>
                        <label className="text-xs text-muted-foreground">Submission Target</label>
                        <p className="text-sm">{selectedArticle.submission_target}</p>
                      </div>
                    )}
                    {selectedArticle.reason_of_research && (
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground">Reason of Research</label>
                        <p className="text-sm mt-1">{selectedArticle.reason_of_research}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {selectedArticle.abstract && (
                <div>
                  <label className="text-sm text-muted-foreground">Abstract</label>
                  <p className="text-sm mt-1 p-3 rounded-lg bg-[hsl(var(--glass-bg))]">{selectedArticle.abstract}</p>
                </div>
              )}

              {selectedArticle.keywords?.length > 0 && (
                <div>
                  <label className="text-sm text-muted-foreground">Keywords</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedArticle.keywords.map((keyword: string, i: number) => (
                      <span key={i} className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Download Section */}
              <div className="flex flex-wrap gap-2">
                {selectedArticle.document_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadMutation.mutate({ articleId: selectedArticle.id, fileType: 'document' })}
                    disabled={downloadMutation.isPending}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Document
                  </Button>
                )}
                {selectedArticle.certificate_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadMutation.mutate({ articleId: selectedArticle.id, fileType: 'certificate' })}
                    disabled={downloadMutation.isPending}
                  >
                    <Award className="w-4 h-4 mr-2" />
                    Download Certificate
                  </Button>
                )}
              </div>

              {/* Publication Details (if published) */}
              {selectedArticle.status === 'published' && selectedArticle.volume && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <h4 className="font-medium text-green-400 mb-2">Publication Details</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Volume:</span>
                      <p className="font-medium">{selectedArticle.volume}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Issue:</span>
                      <p className="font-medium">{selectedArticle.issue}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pages:</span>
                      <p className="font-medium">{selectedArticle.page_number}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Year:</span>
                      <p className="font-medium">{selectedArticle.publication_year}</p>
                    </div>
                  </div>
                  {selectedArticle.published_link && (
                    <div className="mt-3 text-sm">
                      <span className="text-muted-foreground">Published Link:</span>
                      <a
                        href={selectedArticle.published_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline break-all"
                      >
                        {selectedArticle.published_link}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => updateStatusMutation.mutate({ articleId: selectedArticle.id, status: 'under_review', article: selectedArticle })}
              disabled={updateStatusMutation.isPending}
            >
              <Clock className="w-4 h-4 mr-2" />
              Under Review
            </Button>
            <Button
              variant="outline"
              className="text-orange-400 hover:text-orange-300"
              onClick={() => updateStatusMutation.mutate({ articleId: selectedArticle.id, status: 'pending_fee', article: selectedArticle })}
              disabled={updateStatusMutation.isPending}
            >
              Pending Fee
            </Button>
            <Button
              variant="outline"
              className="text-green-400 hover:text-green-300"
              onClick={handlePublishClick}
              disabled={updateStatusMutation.isPending || selectedArticle?.status === 'published'}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Publish
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => updateStatusMutation.mutate({ articleId: selectedArticle.id, status: 'rejected', article: selectedArticle })}
              disabled={updateStatusMutation.isPending}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
