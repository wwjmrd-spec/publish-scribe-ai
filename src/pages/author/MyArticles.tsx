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
import { useMauticSync } from '@/hooks/useMautic';
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
import { ManageCoAuthorsDialog } from '@/components/articles/ManageCoAuthorsDialog';
import { PublicationCard } from '@/components/articles/PublicationCard';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Share2 } from 'lucide-react';

export default function MyArticles() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { subscription, isLoading: subLoading } = useSubscription();
  const { addItem, hasItem } = useCart();
  const [withdrawArticle, setWithdrawArticle] = React.useState<any>(null);
  const [updatingManuscript, setUpdatingManuscript] = React.useState<string | null>(null);
  const [manageCoAuthorsFor, setManageCoAuthorsFor] = React.useState<any>(null);
  const [payReportDialog, setPayReportDialog] = React.useState<{ articleId: string; title: string; refNum: string; amount: number; currency: 'INR' | 'USD' } | null>(null);
  const [payingNow, setPayingNow] = React.useState(false);
  const [hasAvatar, setHasAvatar] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setHasAvatar(!!data?.avatar_url));
  }, [user?.id]);

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
      queryClient.invalidateQueries({ queryKey: ['review-report-downloads-mine', user.id] });

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
          author_name, copyright_form_url, allow_author_edit,
          review_report_download_count, free_review_report_downloaded, review_report_paid,
          publication_year, volume, issue, page_number, published_link
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

  // Real download count from the review_report_downloads audit log
  const { data: downloadStats } = useQuery({
    queryKey: ['review-report-downloads-mine', user?.id],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from('review_report_downloads')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', user!.id);
      return { total: count || 0 };
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });


  // Sync article statuses to Mautic as tags (fire-and-forget, deduped per session)
  const { syncContact } = useMauticSync();
  const lastSyncedRef = React.useRef<string>('');
  React.useEffect(() => {
    if (!user?.email || !articles?.length) return;
    const statuses = Array.from(new Set(articles.map((a: any) => a.status).filter(Boolean)));
    const signature = statuses.sort().join('|');
    if (signature === lastSyncedRef.current) return;
    lastSyncedRef.current = signature;
    const tags = statuses.map((s: string) => `article-status-${s}`);
    const meta: any = user.user_metadata || {};
    syncContact({
      email: user.email,
      tags,
      country: meta.country || '',
      phone: meta.phone || '',
    });
  }, [articles, user?.email, user?.user_metadata, syncContact]);

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
  const canUpdateManuscript = (article: any) => {
    if (article?.allow_author_edit === false) return false;
    return ['submitted', 'under_review', 'revision_requested'].includes(article?.status);
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

        {hasAvatar === false && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-700 dark:text-amber-300">Add a profile picture</p>
              <p className="text-xs text-muted-foreground">
                Your publication cards will look more personal with a photo. You can upload one from your Profile page or directly from any article's Publication Card panel.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/author/profile')}>
              <Upload className="w-4 h-4 mr-1" />
              Upload Now
            </Button>
          </div>
        )}

        {/* Plan Usage Info */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <FileText className="w-4 h-4" />
            <span>
              Review reports: {subscription.reviewReportsUsed}/{subscription.reviewReportsLimit} used
              
              {subscription.plan === 'pro' && ' this month (Pro plan)'}
            </span>
            {(articles && articles.length > 0) && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[hsl(var(--glass-bg-strong))] text-xs">
                Lifetime downloads: {downloadStats?.total ?? articles.reduce((sum: number, a: any) => sum + (a.review_report_download_count || 0), 0)}
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
          <div className="space-y-3">
            {articles?.map((article, index) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 10) * 0.03 }}
              >
                <GlassCard
                  className="hover-glow-cyan cursor-pointer"
                  onClick={() => navigate(`/author/articles/${article.id}`)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                      {getStatusIcon(article.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{article.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {article.reference_number} · {new Date(article.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(article as any).allow_author_edit === false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-300 border border-slate-500/30">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      )}
                      <span className={getStatusBadge(article.status)}>
                        {formatStatus(article.status)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/author/articles/${article.id}`);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
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

      {manageCoAuthorsFor && (
        <ManageCoAuthorsDialog
          open={!!manageCoAuthorsFor}
          onOpenChange={(o) => !o && setManageCoAuthorsFor(null)}
          articleTitle={manageCoAuthorsFor.title}
          coAuthors={manageCoAuthorsFor.co_authors || []}
          invalidateKeys={[['my-articles', user?.id]]}
        />
      )}

      <AlertDialog open={!!payReportDialog} onOpenChange={(o) => !o && setPayReportDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buy Review Report Download</AlertDialogTitle>
            <AlertDialogDescription>
              You've used your 2 free review-report downloads. To download{' '}
              <span className="font-semibold text-foreground">{payReportDialog?.title}</span>
              {payReportDialog?.refNum ? ` (${payReportDialog.refNum})` : ''}, pay{' '}
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
