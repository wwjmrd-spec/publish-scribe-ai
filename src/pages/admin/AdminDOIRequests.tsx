import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2 } from 'lucide-react';

export default function AdminDOIRequests() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const { data: articles, isLoading: loadingArticles } = useQuery({
    queryKey: ['admin-doi-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, reference_number, author_name, doi_paid, doi_paid_at, doi_number, status')
        .eq('doi_paid', true)
        .order('doi_paid_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: legacy, isLoading: loadingLegacy } = useQuery({
    queryKey: ['legacy-doi-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('legacy_doi_requests' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const saveArticleDoi = async (id: string) => {
    const value = (drafts[id] ?? '').trim();
    const { error } = await supabase
      .from('articles')
      .update({ doi_number: value || null } as any)
      .eq('id', id);
    if (error) return toast.error('Could not save DOI: ' + error.message);
    toast.success('DOI saved');
    queryClient.invalidateQueries({ queryKey: ['admin-doi-articles'] });
  };

  const saveLegacyDoi = async (id: string) => {
    const value = (drafts[id] ?? '').trim();
    const { error } = await supabase
      .from('legacy_doi_requests' as any)
      .update({
        doi_number: value || null,
        status: value ? 'completed' : 'paid',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id);
    if (error) return toast.error('Could not save DOI: ' + error.message);
    toast.success('DOI saved');
    queryClient.invalidateQueries({ queryKey: ['legacy-doi-requests'] });
  };

  const loading = loadingArticles || loadingLegacy;

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2 flex items-center gap-2">
          <Link2 className="w-6 h-6 text-primary" /> DOI Requests
        </h1>
        <p className="text-muted-foreground">
          Articles authors have paid a DOI for, plus DOI requests for articles published in past issues.
        </p>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><GlassSpinner size="lg" /></div>
      ) : (
        <Tabs defaultValue="articles">
          <TabsList className="mb-4">
            <TabsTrigger value="articles">Platform Articles ({articles?.length || 0})</TabsTrigger>
            <TabsTrigger value="legacy">Past Issues ({legacy?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="articles">
            <div className="space-y-3">
              {(articles || []).length === 0 && (
                <GlassCard><p className="text-sm text-muted-foreground">No paid DOI requests yet.</p></GlassCard>
              )}
              {(articles || []).map((a) => (
                <GlassCard key={a.id}>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.reference_number} · {a.author_name || '—'} ·{' '}
                        {a.doi_paid_at ? new Date(a.doi_paid_at).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Input
                        className="glass-input font-mono text-sm w-full lg:w-64"
                        placeholder="10.xxxx/wwjmrd.xxxx"
                        value={drafts[a.id] ?? a.doi_number ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                      />
                      <Button size="sm" onClick={() => saveArticleDoi(a.id)}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/admin/articles/${a.id}`)}>
                        View
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="legacy">
            <div className="space-y-3">
              {(legacy || []).length === 0 && (
                <GlassCard><p className="text-sm text-muted-foreground">No past-issue DOI requests yet.</p></GlassCard>
              )}
              {(legacy || []).map((r) => (
                <GlassCard key={r.id}>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{r.article_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.reference_number || '—'} ·{' '}
                        <span className={r.status === 'pending' ? 'text-amber-500' : 'text-emerald-500'}>
                          {r.status}
                        </span>
                        {r.paid_at ? ` · paid ${new Date(r.paid_at).toLocaleDateString()}` : ''}
                      </p>
                      {r.published_link && (
                        <a href={r.published_link} target="_blank" rel="noreferrer" className="text-xs text-primary break-all">
                          {r.published_link}
                        </a>
                      )}
                      {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Input
                        className="glass-input font-mono text-sm w-full lg:w-64"
                        placeholder="10.xxxx/wwjmrd.xxxx"
                        value={drafts[r.id] ?? r.doi_number ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                      />
                      <Button size="sm" onClick={() => saveLegacyDoi(r.id)}>Save</Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </DashboardLayout>
  );
}
