import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Award,
  Download,
  FileText,
  Users,
} from 'lucide-react';

export default function Certificates() {
  const { user, isIndian } = useAuth();
  const currency = isIndian ? 'INR' : 'USD';
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
        .from('publication_fees')
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
      toast.error('Failed to download: ' + error.message);
    },
  });

  const handleDownloadCertificate = async (articleId: string) => {
    downloadMutation.mutate({ articleId, fileType: 'certificate' });
  };

  const handlePayCoAuthorCertificate = async (coAuthorId: string, articleId: string) => {
    // TODO: Implement co-author certificate payment
    toast.info('Co-author certificate payment coming soon');
    console.log('Paying for co-author:', coAuthorId, articleId);
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
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center glow-cyan">
                        <FileText className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{article.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {article.reference_number}
                        </p>
                      </div>
                    </div>
                    <span className="status-published">Published</span>
                  </div>

                  {/* Publication Details */}
                  {article.volume && (
                    <div className="grid grid-cols-4 gap-4 p-4 rounded-lg bg-[hsl(var(--glass-bg))] mb-4">
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Award className="w-6 h-6 text-primary" />
                        <div>
                          <p className="font-medium">Publication Certificate</p>
                          <p className="text-sm text-muted-foreground">
                            Main author certificate
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => handleDownloadCertificate(article.id)}
                        disabled={!article.certificate_url || downloadMutation.isPending}
                      >
                        {downloadMutation.isPending ? (
                          <GlassSpinner size="sm" className="mr-2" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        Download
                      </Button>
                    </div>
                  </div>

                  {/* Co-Author Certificates */}
                  {article.co_authors && article.co_authors.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="w-5 h-5 text-muted-foreground" />
                        <h4 className="font-medium">Co-Author Certificates</h4>
                      </div>

                      <div className="space-y-2">
                        {article.co_authors.map((coAuthor: any) => {
                          const certificate = coAuthor.co_author_certificates?.[0];
                          const isPaid = certificate?.payment_status === 'paid';

                          return (
                            <div
                              key={coAuthor.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--glass-bg))]"
                            >
                              <div>
                                <p className="font-medium">{coAuthor.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {coAuthor.email}
                                </p>
                              </div>

                              {isPaid ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    certificate.certificate_url &&
                                    window.open(certificate.certificate_url, '_blank')
                                  }
                                >
                                  <Download className="w-4 h-4 mr-1" />
                                  Download
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="gradient-primary"
                                  onClick={() =>
                                    handlePayCoAuthorCertificate(coAuthor.id, article.id)
                                  }
                                >
                                  Pay {currencySymbol}{coAuthorFee}
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
