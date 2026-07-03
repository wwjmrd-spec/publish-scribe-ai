import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription, incrementUsage } from '@/hooks/useSubscription';
import { toast } from 'sonner';
import { downloadFromUrl } from '@/lib/downloadFile';
import { queryTimeout } from '@/lib/queryTimeout';
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
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { WithdrawArticleDialog } from '@/components/articles/WithdrawArticleDialog';
import { GalleyProofReviewSection } from '@/components/articles/GalleyProofReviewSection';
import { CopyrightFormSection } from '@/components/articles/CopyrightFormSection';

export default function MyArticles() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { subscription, isLoading: subLoading } = useSubscription();
  const { addItem, hasItem } = useCart();
  const [withdrawArticle, setWithdrawArticle] = React.useState<any>(null);
  const [updatingManuscript, setUpdatingManuscript] = React.useState<string | null>(null);
  const [payReportDialog, setPayReportDialog] = React.useState<{ articleId: string; title: string; refNum: string; amount: number; currency: 'INR' | 'USD' } | null>(null);
  const [payingNow, setPayingNow] = React.useState(false);

  const handleDownloadGalleyProof = async (articleId: string) => {
    const tid = toast.loading('Preparing galley proof…');
    try {
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType: 'formatted_document' },
      });
      if (response.error || !response.data?.url) {
        toast.error('Failed to get galley proof download link', { id: tid });
        return;
      }
      toast.success('Galley proof ready', { id: tid });
      downloadFromUrl(response.data.url, `galley-proof-${articleId}.pdf`);
    } catch {
      toast.error('Failed to download galley proof', { id: tid });
    }
  };

  const handleDownloadReport = async (articleId: string, articleMeta?: { title: string; refNum: string }) => {
    if (!user) return;

    const tid = toast.loading('Preparing review report…');
    try {
      const response = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType: 'review_report' },
      });

      // Payment required (Free plan, already used the 1 free per-article download)
      if ((response.data as any)?.paymentRequired) {
        const d: any = response.data;
        const currency: 'INR' | 'USD' = d.currency === 'INR' ? 'INR' : 'USD';
        const amount = typeof d.amount === 'number' ? d.amount : (currency === 'INR' ? 100 : 5);
        toast.dismiss(tid);
        setPayReportDialog({
          articleId,
          title: articleMeta?.title || 'this article',
          refNum: articleMeta?.refNum || '',
          amount,
          currency,
        });
        return;
      }

      if (response.error || !response.data?.url) {
        const msg = (response.data as any)?.error || 'Failed to prepare review report';
        toast.error(msg, { id: tid });
        return;
      }

      toast.success('Review report ready', { id: tid });
      downloadFromUrl(response.data.url, `review-report-${articleId}.pdf`);
      queryClient.invalidateQueries({ queryKey: ['my-articles', user.id] });
      queryClient.invalidateQueries({ queryKey: ['plan-usage', user.id] });
      queryClient.invalidateQueries({ queryKey: ['plan-usage-free-period', user.id] });
    } catch {
      toast.error('Failed to download review report', { id: tid });
    }
  };

  const addReportToCartAndGo = (articleId: string, title: string, refNum: string, amount: number) => {
    const cartId = `review_report:${articleId}`;
    if (!hasItem(cartId)) {
      addItem({
        id: cartId,
        type: 'review_report',
        label: `Review Report — ${refNum || title}`,
        description: `Downloadable review report for "${title}"`,
        amount,
        articleId,
      });
    }
    setPayReportDialog(null);
    navigate('/author/cart');
  };

  const payReportNow = async () => {
    if (!payReportDialog || !user) return;
    const { articleId, amount, currency, title, refNum } = payReportDialog;
    setPayingNow(true);
    try {
      if (currency === 'INR') {
        // Ensure Razorpay SDK
        if (!(window as any).Razorpay) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://checkout.razorpay.com/v1/checkout.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Razorpay SDK failed to load'));
            document.body.appendChild(s);
          });
        }
        const orderRes = await supabase.functions.invoke('create-razorpay-order', {
          body: {
            items: [{ type: 'review_report', articleId }],
            amount,
            currency: 'INR',
          },
        });
        if (orderRes.error || orderRes.data?.error) {
          throw new Error(orderRes.error?.message || orderRes.data?.error || 'Order failed');
        }
        const orderData: any = orderRes.data;
        const rzp = new (window as any).Razorpay({
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: 'WWJMRD',
          description: `Review Report — ${refNum || title}`,
          order_id: orderData.orderId,
          prefill: { email: user.email, name: user.user_metadata?.full_name || '' },
          theme: { color: '#00d4ff' },
          handler: async (resp: any) => {
            try {
              const v = await supabase.functions.invoke('verify-payment', {
                body: {
                  gateway: 'razorpay',
                  paymentId: orderData.paymentId,
                  razorpayOrderId: resp.razorpay_order_id,
                  razorpayPaymentId: resp.razorpay_payment_id,
                  razorpaySignature: resp.razorpay_signature,
                },
              });
              if (v.error || v.data?.error) throw new Error(v.error?.message || v.data?.error);
              toast.success('Payment successful. Preparing your report…');
              setPayReportDialog(null);
              queryClient.invalidateQueries({ queryKey: ['my-articles', user.id] });
              // Immediately trigger download
              await handleDownloadReport(articleId, { title, refNum });
            } catch (e: any) {
              toast.error('Payment verification failed: ' + (e.message || 'unknown'));
            } finally {
              setPayingNow(false);
            }
          },
          modal: { ondismiss: () => setPayingNow(false) },
        });
        rzp.open();
      } else {
        // USD / USDT — route through cart for PayPal/Binance selection.
        addReportToCartAndGo(articleId, title, refNum, amount);
        setPayingNow(false);
      }
    } catch (e: any) {
      toast.error('Failed to start payment: ' + (e.message || 'unknown'));
      setPayingNow(false);
    }
  };





  const handleUpdateManuscript = async (articleId: string, file: File) => {
    if (!user?.id) return;
    setUpdatingManuscript(articleId);
    try {
      const filePath = `${user.id}/${crypto.randomUUID()}.docx`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('articles')
        .update({
          document_url: filePath,
          status: 'revised_submitted',
          review_report_url: null,
        } as any)
        .eq('id', articleId);
      if (updateError) throw updateError;

      // Get article info and profile for emails/notifications
      const { data: articleData } = await supabase
        .from('articles')
        .select('title, reference_number, author_name')
        .eq('id', articleId)
        .single();

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      // Get admin email from settings
      const { data: adminSettings } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'admin_notification_email')
        .single();
      const adminEmail = adminSettings?.setting_value || 'shubhmeena23@gmail.com';

      const emailData = {
        articleTitle: articleData?.title || 'Untitled',
        referenceNumber: articleData?.reference_number || 'N/A',
        authorName: articleData?.author_name || profile?.full_name || 'Author',
        authorEmail: profile?.email || user.email,
        submissionDate: new Date().toLocaleDateString(),
      };

      // Send email to author (confirmation)
      supabase.functions.invoke('send-email', {
        body: { to: profile?.email || user.email, template: 'manuscript-update', data: emailData, isAdmin: false },
      }).catch((err) => console.error('Failed to send author manuscript update email:', err));

      // Send email to admin
      supabase.functions.invoke('send-email', {
        body: { to: adminEmail, template: 'manuscript-update', data: emailData, isAdmin: true },
      }).catch((err) => console.error('Failed to send admin manuscript update email:', err));

      // Create notification for admins
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins) {
        const notifications = admins.map((a) => ({
          user_id: a.user_id,
          title: 'Revised Manuscript Submitted ✨',
          message: `Author ${emailData.authorName} has submitted a revised manuscript for "${emailData.articleTitle}" (${emailData.referenceNumber}).`,
          type: 'info',
          link: `/admin/ai-review?articleId=${articleId}`,
        }));
        await supabase.from('notifications').insert(notifications);
      }

      toast.success('Revised manuscript submitted successfully! The admin can re-analyze it now.');
      queryClient.invalidateQueries({ queryKey: ['my-articles'] });
    } catch (err: any) {
      toast.error('Failed to update manuscript: ' + (err.message || 'Unknown error'));
    } finally {
      setUpdatingManuscript(null);
    }
  };

  const { data: articles, isLoading } = useQuery({
    queryKey: ['my-articles', user?.id],
    queryFn: async () => {
      // Split the heavy co-authors join out so slow joins can't block the page.
      const { data: rows, error } = await supabase
        .from('articles')
        .select(`
          id, reference_number, author_id, title, abstract, status,
          review_report_url, certificate_url, created_at,
          publication_type, galley_proof_status, galley_proof_sent_at,
          galley_proof_deadline, galley_proof_pdf_url, galley_proof_word_url,
          allow_withdrawal, document_url, page_count, keywords,
          author_name, copyright_form_url,
          review_report_download_count, free_review_report_downloaded, review_report_paid
        `)
        .eq('author_id', user?.id)
        .order('created_at', { ascending: false })
        .abortSignal(queryTimeout());

      if (error) throw error;
      const list = rows || [];
      const ids = list.map((a: any) => a.id);
      let coMap: Record<string, any[]> = {};
      if (ids.length) {
        const { data: co } = await supabase
          .from('co_authors')
          .select('id, article_id, name, email, affiliation, country, certificate_url, payment_status')
          .in('article_id', ids)
          .abortSignal(queryTimeout());
        (co || []).forEach((c: any) => {
          coMap[c.article_id] = coMap[c.article_id] || [];
          coMap[c.article_id].push(c);
        });
      }
      return list.map((a: any) => ({ ...a, co_authors: coMap[a.id] || [] }));
    },
    enabled: !!user?.id,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <Clock className="w-4 h-4" />;
      case 'under_review': return <Eye className="w-4 h-4" />;
      case 'manuscript_accepted': return <CheckCircle className="w-4 h-4" />;
      case 'pending_fee': return <AlertCircle className="w-4 h-4" />;
      case 'paid':
      case 'published': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'withdrawn': return <Ban className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
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

  // Can update manuscript before review (submitted/under_review) or when revision requested (rejected for resubmit)
  const canUpdateManuscript = (status: string) => {
    return ['submitted', 'under_review', 'revision_requested'].includes(status);
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <FileText className="w-4 h-4" />
            <span>
              Review reports: {subscription.reviewReportsUsed}/{subscription.reviewReportsLimit} used
              {subscription.plan === 'free' && ' this period (Free plan — 1 free per article, then paid)'}
              {subscription.plan === 'pro' && ' this month (Pro plan)'}
            </span>
            {articles && articles.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[hsl(var(--glass-bg-strong))] text-xs">
                Lifetime downloads: {articles.reduce((sum: number, a: any) => sum + (a.review_report_download_count || 0), 0)}
              </span>
            )}
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
                      {(article as any).page_count && (
                        <span>📄 {(article as any).page_count} pages</span>
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
                      {article.document_url && (
                        <DownloadButton
                          size="sm"
                          variant="outline"
                          onDownload={async () => {
                            const tid = toast.loading('Preparing article…');
                            try {
                              const response = await supabase.functions.invoke('get-document-url', {
                                body: { articleId: article.id, fileType: 'document' },
                              });
                              if (response.error || !response.data?.url) {
                                toast.error('Failed to get download link', { id: tid });
                                throw new Error('no url');
                              }
                              toast.success('Article ready', { id: tid });
                              downloadFromUrl(response.data.url, `${article.reference_number || article.id}.docx`);
                            } catch (e) {
                              toast.error('Failed to download article', { id: tid });
                              throw e;
                            }
                          }}
                        >
                          Article
                        </DownloadButton>
                      )}
                      {article.review_report_url && (
                        <DownloadButton
                          size="sm"
                          onDownload={async () => {
                            await handleDownloadReport(article.id, {
                              title: article.title,
                              refNum: article.reference_number,
                            });
                          }}
                        >
                          Report
                          {(article as any).review_report_download_count > 0 && (
                            <span className="ml-1.5 text-xs opacity-80">
                              ({(article as any).review_report_download_count})
                            </span>
                          )}
                        </DownloadButton>
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

                      {/* AI Auto-Correct (Pro feature, requires review report) */}
                      {article.review_report_url &&
                        !['manuscript_accepted', 'rejected', 'withdrawn', 'galley_proof_sent', 'published'].includes(article.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-primary border-primary/40"
                          onClick={() => {
                            if (subscription.plan !== 'pro' || !subscription.isActive) {
                              toast(
                                <div className="flex flex-col gap-2">
                                  <p className="font-semibold flex items-center gap-1">
                                    <Crown className="w-4 h-4" /> Pro feature
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Let AI auto-correct your manuscript using the review report. Available on Pro.
                                  </p>
                                  <Button size="sm" className="gradient-primary mt-1 w-fit" onClick={() => navigate('/author/subscription')}>
                                    <Crown className="w-4 h-4 mr-1" /> Upgrade to Pro
                                  </Button>
                                </div>
                              );
                              return;
                            }
                            navigate(`/author/ai-correct/${article.id}`);
                          }}
                        >
                          <Sparkles className="w-4 h-4 mr-1" />
                          AI Auto-Correct
                          {(subscription.plan !== 'pro' || !subscription.isActive) && (
                            <Lock className="w-3 h-3 ml-1" />
                          )}
                        </Button>
                      )}

                      {/* Update Manuscript - before review */}
                      {canUpdateManuscript(article.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-primary"
                          disabled={updatingManuscript === article.id}
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.docx,.doc';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) handleUpdateManuscript(article.id, file);
                            };
                            input.click();
                          }}
                        >
                          {updatingManuscript === article.id ? (
                            <GlassSpinner size="sm" />
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1" />
                              Update Manuscript
                            </>
                          )}
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

                    {/* Galley Proof Review */}
                    {(article as any).galley_proof_status && (
                      <GalleyProofReviewSection article={article} />
                    )}

                    {/* Copyright Form Upload */}
                    <CopyrightFormSection article={article} />
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

      <AlertDialog open={!!payReportDialog} onOpenChange={(o) => !o && setPayReportDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buy Review Report Download</AlertDialogTitle>
            <AlertDialogDescription>
              You've already used your 1 free review-report download for{' '}
              <span className="font-semibold text-foreground">{payReportDialog?.title}</span>
              {payReportDialog?.refNum ? ` (${payReportDialog.refNum})` : ''}. Pay{' '}
              <span className="font-semibold text-foreground">
                {payReportDialog?.currency === 'INR'
                  ? `₹${payReportDialog?.amount ?? 100}`
                  : `$${payReportDialog?.amount ?? 5}`}
              </span>{' '}
              to download it again — or upgrade to Pro for 10 free review-report downloads
              every month.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setPayReportDialog(null);
                navigate('/author/subscription');
              }}
            >
              <Crown className="w-4 h-4 mr-1" /> Upgrade to Pro
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                payReportDialog &&
                addReportToCartAndGo(
                  payReportDialog.articleId,
                  payReportDialog.title,
                  payReportDialog.refNum,
                  payReportDialog.amount,
                )
              }
            >
              Add to Cart
            </Button>
            <AlertDialogAction
              disabled={payingNow}
              onClick={(e) => {
                e.preventDefault();
                payReportNow();
              }}
            >
              {payingNow ? <><GlassSpinner size="sm" className="mr-2" />Processing…</> : 'Pay Now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
