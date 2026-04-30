import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Search,
  Eye,
  Download,
  Send,
  CheckCircle,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { SendGalleyProofDialog } from '@/components/admin/SendGalleyProofDialog';

type GalleyTab = 'all' | 'sent' | 'approved' | 'revision_submitted';

export default function AdminGalleyProofs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<GalleyTab>('all');
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [isGalleyDialogOpen, setIsGalleyDialogOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: articles, isLoading } = useQuery({
    queryKey: ['admin-galley-proofs', activeTab],
    queryFn: async () => {
      let query = supabase
        .from('articles')
        .select(`
          *,
          profiles:author_id (full_name, email, country, affiliation)
        `)
        .not('galley_proof_status', 'is', null)
        .neq('status', 'published')
        .order('galley_proof_sent_at', { ascending: false, nullsFirst: false });

      if (activeTab !== 'all') {
        query = query.eq('galley_proof_status', activeTab);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async ({ articleId, fileType }: { articleId: string; fileType: string }) => {
      const { data, error } = await supabase.functions.invoke('get-document-url', {
        body: { articleId, fileType },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('No URL returned');
      }
    },
    onError: (err: any) => toast.error('Download failed: ' + err.message),
  });

  const filtered = articles?.filter((a: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const profile = a.profiles as any;
    return (
      a.title?.toLowerCase().includes(q) ||
      a.reference_number?.toLowerCase().includes(q) ||
      profile?.full_name?.toLowerCase().includes(q) ||
      profile?.email?.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge variant="outline" className="border-blue-500/50 text-blue-400"><Send className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'approved':
        return <Badge variant="outline" className="border-emerald-500/50 text-emerald-400"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'revision_submitted':
        return <Badge variant="outline" className="border-amber-500/50 text-amber-400"><RotateCcw className="w-3 h-3 mr-1" />Revised</Badge>;
      default:
        return <Badge variant="outline" className="border-muted-foreground/50 text-muted-foreground"><Clock className="w-3 h-3 mr-1" />{status}</Badge>;
    }
  };

  const counts = {
    all: articles?.length || 0,
    sent: articles?.filter((a: any) => a.galley_proof_status === 'sent').length || 0,
    approved: articles?.filter((a: any) => a.galley_proof_status === 'approved').length || 0,
    revision_submitted: articles?.filter((a: any) => a.galley_proof_status === 'revision_submitted').length || 0,
  };

  return (
    <DashboardLayout type="admin">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Galley Proofs</h1>
            <p className="text-muted-foreground mt-1">Manage all galley proof submissions and reviews</p>
          </div>
        </div>

        <GlassCard>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, reference, or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 glass-input"
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as GalleyTab)}>
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="sent">Sent ({counts.sent})</TabsTrigger>
              <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
              <TabsTrigger value="revision_submitted">Revised ({counts.revision_submitted})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="flex justify-center py-12"><GlassSpinner size="lg" /></div>
              ) : !filtered?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No galley proofs found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((article: any) => {
                    const profile = article.profiles as any;
                    return (
                      <div
                        key={article.id}
                        className="p-4 rounded-lg bg-muted/20 border border-border/50 hover:border-primary/30 transition-colors"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusBadge(article.galley_proof_status)}
                              <span className="text-xs text-muted-foreground font-mono">{article.reference_number}</span>
                            </div>
                            <h3 className="font-medium text-sm truncate">{article.title}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {profile?.full_name || 'Unknown'} • {profile?.email || 'N/A'}
                            </p>
                            <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                              {article.galley_proof_sent_at && (
                                <span>Sent: {new Date(article.galley_proof_sent_at).toLocaleDateString()}</span>
                              )}
                              {article.galley_proof_deadline && (
                                <span className={new Date(article.galley_proof_deadline) < new Date() ? 'text-destructive' : 'text-amber-400'}>
                                  Deadline: {new Date(article.galley_proof_deadline).toLocaleDateString()}
                                </span>
                              )}
                              {article.galley_proof_consent && (
                                <span className="text-emerald-400">✓ Consent given</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {article.galley_proof_word_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadMutation.mutate({ articleId: article.id, fileType: 'galley_proof_word' })}
                                disabled={downloadMutation.isPending}
                              >
                                <Download className="w-3 h-3 mr-1" /> Word
                              </Button>
                            )}
                            {article.galley_proof_pdf_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadMutation.mutate({ articleId: article.id, fileType: 'galley_proof_pdf' })}
                                disabled={downloadMutation.isPending}
                              >
                                <Download className="w-3 h-3 mr-1" /> PDF
                              </Button>
                            )}
                            {article.galley_proof_revision_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-amber-400"
                                onClick={() => downloadMutation.mutate({ articleId: article.id, fileType: 'galley_proof_revision' })}
                                disabled={downloadMutation.isPending}
                              >
                                <Download className="w-3 h-3 mr-1" /> Revised
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-primary"
                              onClick={() => {
                                setSelectedArticle(article);
                                setIsGalleyDialogOpen(true);
                              }}
                            >
                              <Send className="w-3 h-3 mr-1" /> Re-send
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/admin/articles/${article.id}`)}
                            >
                              <Eye className="w-3 h-3 mr-1" /> View
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </GlassCard>
      </motion.div>

      {selectedArticle && (
        <SendGalleyProofDialog
          open={isGalleyDialogOpen}
          onOpenChange={(open) => {
            setIsGalleyDialogOpen(open);
            if (!open) {
              queryClient.invalidateQueries({ queryKey: ['admin-galley-proofs'] });
            }
          }}
          article={selectedArticle}
        />
      )}
    </DashboardLayout>
  );
}
