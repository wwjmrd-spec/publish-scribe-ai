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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { downloadFromUrl } from '@/lib/downloadFile';
import { useSubscription } from '@/hooks/useSubscription';
import {
  Award,
  Download,
  FileText,
  Users,
  Sparkles,
  ShoppingCart,
} from 'lucide-react';

export default function Certificates() {
  const { user, isIndian } = useAuth();
  const { subscription, isLoading: subLoading } = useSubscription();
  const { addItem, hasItem } = useCart();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currencySymbol = isIndian ? '₹' : '$';

  const { data: publishedArticles, isLoading } = useQuery({
    queryKey: ['published-articles', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          co_authors (
            *,
            co_author_certificates (*)
          )
        `)
        .eq('author_id', user?.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: fees } = useQuery({
    queryKey: ['publication-fees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('publication_fees_public' as any)
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const coAuthorFee = fees
    ? isIndian
      ? Number(fees.indian_coauthor_fee)
      : Number(fees.international_coauthor_fee)
    : isIndian
    ? 500
    : 10;

  const downloadMutation = useMutation({
    mutationFn: async ({ articleId, fileType }: { articleId: string; fileType: string }) => {
      const tid = toast.loading('Preparing certificate…');
      try {
        const response = await supabase.functions.invoke('get-document-url', {
          body: { articleId, fileType },
        });
        if (response.error) throw new Error(response.error.message);
        if (response.data?.error) throw new Error(response.data.error);
        toast.success('Certificate ready', { id: tid });
        return response.data;
      } catch (e) {
        toast.dismiss(tid);
        throw e;
      }
    },
    onSuccess: (data) => {
      if (data.url) {
        downloadFromUrl(data.url);
      }
    },
    onError: (error) => {
      toast.error('Failed to download: ' + error.message);
    },
  });

  const coAuthorDownloadMutation = useMutation({
    mutationFn: async ({ fileName }: { fileName: string }) => {
      const tid = toast.loading('Preparing co-author certificate…');
      try {
        const { data, error } = await supabase.functions.invoke('get-document-url', {
          body: { fileName, fileType: 'coauthor_certificate' },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        toast.success('Certificate ready', { id: tid });
        return data;
      } catch (e) {
        toast.dismiss(tid);
        throw e;
      }
    },
    onSuccess: (data) => {
      if (data.url) {
        downloadFromUrl(data.url);
      }
    },
    onError: (error) => {
      toast.error('Failed to download co-author certificate: ' + error.message);
    },
  });

  // Free generation for Pro plan users
  const freeGenerateMutation = useMutation({
    mutationFn: async ({ coAuthorId, articleId }: { coAuthorId: string; articleId: string }) => {
      const response = await supabase.functions.invoke('generate-free-coauthor-cert', {
        body: { coAuthorId, articleId },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Co-author certificate generated successfully!');
      queryClient.invalidateQueries({ queryKey: ['published-articles'] });
      queryClient.invalidateQueries({ queryKey: ['plan-usage'] });
    },
    onError: (error) => {
      toast.error('Failed to generate certificate: ' + error.message);
    },
  });

  const handleDownloadCertificate = async (articleId: string) => {
    downloadMutation.mutate({ articleId, fileType: 'certificate' });
  };

  const handleDownloadCoAuthorCertificate = (certificate: any) => {
    if (certificate?.certificate_url) {
      coAuthorDownloadMutation.mutate({ fileName: certificate.certificate_url });
    }
  };

  const handleAddCertToCart = (coAuthorId: string, coAuthorName: string, articleId: string, articleTitle: string) => {
    const cartItemId = `cert_${coAuthorId}`;
    if (hasItem(cartItemId)) {
      toast.info('Already in cart');
      navigate('/author/cart');
      return;
    }

    addItem({
      id: cartItemId,
      type: 'coauthor_certificate',
      label: `Co-Author Certificate: ${coAuthorName}`,
      description: `For: ${articleTitle}`,
      amount: coAuthorFee,
      coAuthorId,
      articleId,
    });

    toast.success('Co-author certificate added to cart!');
    navigate('/author/cart');
  };

  const handleFreeCoAuthorCertificate = async (coAuthorId: string, articleId: string) => {
    freeGenerateMutation.mutate({ coAuthorId, articleId });
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
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Certificates</h1>
          <p className="text-muted-foreground">
            Download publication certificates and manage co-author certificates
          </p>
        </div>

        {publishedArticles?.length === 0 ? (
          <GlassCard className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center mx-auto mb-6">
              <Award className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              No certificates yet
            </h3>
            <p className="text-muted-foreground">
              Certificates will be available once your articles are published
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-6">
            {publishedArticles?.map((article, index) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <GlassCard>
                  {/* Article Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center glow-cyan shrink-0">
                        <FileText className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg truncate">{article.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {article.reference_number}
                        </p>
                      </div>
                    </div>
                    <span className="status-published shrink-0 self-start">Published</span>
                  </div>

                  {/* Publication Details */}
                  {article.volume && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-[hsl(var(--glass-bg))] mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Volume</p>
                        <p className="font-medium">{article.volume}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Issue</p>
                        <p className="font-medium">{article.issue}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pages</p>
                        <p className="font-medium">{article.page_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Year</p>
                        <p className="font-medium">{article.publication_year}</p>
                      </div>
                    </div>
                  )}

                  {/* Main Certificate */}
                  <div className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Award className="w-6 h-6 text-primary shrink-0" />
                        <div>
                          <p className="font-medium">Publication Certificate</p>
                          <p className="text-sm text-muted-foreground">
                            Main author certificate (PDF)
                          </p>
                        </div>
                      </div>
                      <DownloadButton
                        className="w-full sm:w-auto"
                        onDownload={() => downloadMutation.mutateAsync({ articleId: article.id, fileType: 'certificate' })}
                        disabled={!article.certificate_url}
                      >
                        Download PDF
                      </DownloadButton>
                    </div>
                  </div>

                  {/* Co-Author Certificates */}
                  {article.co_authors && article.co_authors.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="w-5 h-5 text-muted-foreground" />
                        <h4 className="font-medium">Co-Author Certificates</h4>
                        {subscription.plan === 'pro' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                            {subscription.coauthorCertsUsed}/{subscription.coauthorCertsLimit} free used
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {article.co_authors.map((coAuthor: any) => {
                          const certificate = coAuthor.co_author_certificates?.[0];
                          const isPaid = certificate?.payment_status === 'paid';
                          const isProWithFreeQuota = subscription.plan === 'pro' && subscription.canCreateCoauthorCert;
                          const isGeneratingThis = freeGenerateMutation.isPending && freeGenerateMutation.variables?.coAuthorId === coAuthor.id;
                          const isInCart = hasItem(`cert_${coAuthor.id}`);

                          return (
                             <div
                              key={coAuthor.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-[hsl(var(--glass-bg))]"
                            >
                              <div>
                                <p className="font-medium">{coAuthor.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {coAuthor.email}
                                </p>
                              </div>

                              {isPaid ? (
                                <DownloadButton
                                  size="sm"
                                  onDownload={() => coAuthorDownloadMutation.mutateAsync({ fileName: certificate.certificate_url })}
                                >
                                  Download PDF
                                </DownloadButton>
                              ) : isProWithFreeQuota ? (
                                <Button
                                  size="sm"
                                  className="gradient-primary"
                                  onClick={() => handleFreeCoAuthorCertificate(coAuthor.id, article.id)}
                                  disabled={isGeneratingThis}
                                >
                                  {isGeneratingThis ? (
                                    <GlassSpinner size="sm" className="mr-1" />
                                  ) : (
                                    <Sparkles className="w-4 h-4 mr-1" />
                                  )}
                                  Generate Free
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="gradient-primary"
                                  onClick={() =>
                                    handleAddCertToCart(coAuthor.id, coAuthor.name, article.id, article.title)
                                  }
                                  disabled={isInCart}
                                >
                                  {isInCart ? (
                                    <>In Cart</>
                                  ) : (
                                    <>
                                      <ShoppingCart className="w-4 h-4 mr-1" />
                                      Add to Cart — {currencySymbol}{coAuthorFee}
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
