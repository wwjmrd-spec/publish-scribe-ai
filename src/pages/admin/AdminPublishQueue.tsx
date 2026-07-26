import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Plus, Trash2, CheckCircle, Search, FileText, ClipboardList, Globe, RefreshCw } from 'lucide-react';

export default function AdminPublishQueue() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['publish-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, reference_number, author_name, status, publish_queue_added_at, wwjmrd_article_id, published_to_wwjmrd_at')
        .eq('in_publish_queue', true)
        .neq('status', 'published')
        .neq('status', 'published_to_wwjmrd')
        .order('publish_queue_added_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ['publish-queue-candidates', search],
    enabled: addOpen,
    queryFn: async () => {
      let q = supabase
        .from('articles')
        .select('id, title, reference_number, author_name, status')
        .eq('in_publish_queue', false)
        .neq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50);
      if (search.trim()) {
        q = q.or(
          `title.ilike.%${search}%,reference_number.ilike.%${search}%,author_name.ilike.%${search}%`
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('articles')
        .update({ in_publish_queue: true, publish_queue_added_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Added to publishing queue');
      qc.invalidateQueries({ queryKey: ['publish-queue'] });
      qc.invalidateQueries({ queryKey: ['publish-queue-candidates'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('articles')
        .update({ in_publish_queue: false, publish_queue_added_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Removed from queue');
      qc.invalidateQueries({ queryKey: ['publish-queue'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('articles')
        .update({ status: 'published', in_publish_queue: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Article published');
      qc.invalidateQueries({ queryKey: ['publish-queue'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const publishToWwjmrdMutation = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode?: 'update' }) => {
      const { data, error } = await supabase.functions.invoke('publish-to-wwjmrd', {
        body: { articleId: id, ...(mode ? { mode } : {}) },
      });
      console.log('publish-to-wwjmrd response:', { data, error });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Publish failed');
      return data;
    },
    onSuccess: (data) => {
      if (data.warning) {
        toast.warning(data.warning, { duration: 12000 });
      } else {
        toast.success(
          `${data.updated ? 'Updated on' : 'Published to'} WWJMRD (ID ${data.wwjmrd_article_id}, ${data.month} ${data.year}, #${data.order_number}).`
        );
      }
      qc.invalidateQueries({ queryKey: ['publish-queue'] });
    },

    onError: (e: any) => toast.error('Publish to WWJMRD failed: ' + e.message),
  });


  return (
    <DashboardLayout type="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Publishing Queue</h1>
            <p className="text-muted-foreground mt-1">
              Articles staged for publication. They remain here until published or removed.
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" /> Add Article
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Article to Publishing Queue</DialogTitle>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, reference, or author..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {candidates.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No articles found.
                  </p>
                )}
                {candidates.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg-strong))]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.reference_number} • {a.author_name} •{' '}
                        <Badge variant="outline" className="ml-1">
                          {a.status?.replace(/_/g, ' ')}
                        </Badge>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => addMutation.mutate(a.id)}
                      disabled={addMutation.isPending}
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <GlassCard className="p-6">
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading…</p>
          ) : queue.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No articles in the publishing queue.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Add Article" to stage one for publication.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 p-4 rounded-lg border border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg-strong))]"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/articles/${a.id}`}
                      className="font-medium hover:text-primary truncate block"
                    >
                      {a.title}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.reference_number} • {a.author_name} •{' '}
                      <Badge variant="outline" className="ml-1">
                        {a.status?.replace(/_/g, ' ')}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button asChild size="sm" variant="outline" className="gap-1">
                      <Link to={`/admin/publish-queue/${a.id}/publication-form`}>
                        <ClipboardList className="w-4 h-4" /> Prepare Publication
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-green-400 border-green-500/30 hover:text-green-300"
                      onClick={() => {
                        if (confirm('Publish this article to WWJMRD now? This will POST article data to wwjmrd.com.'))
                          publishToWwjmrdMutation.mutate({ id: a.id });
                      }}
                      disabled={publishToWwjmrdMutation.isPending}
                    >
                      <Globe className="w-4 h-4" /> Publish to WWJMRD
                    </Button>
                    {a.wwjmrd_article_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-blue-400 border-blue-500/30 hover:text-blue-300"
                        onClick={() => {
                          if (confirm('Update this article on WWJMRD with the latest PDF and details?'))
                            publishToWwjmrdMutation.mutate({ id: a.id, mode: 'update' });
                        }}
                        disabled={publishToWwjmrdMutation.isPending}
                      >
                        <RefreshCw className="w-4 h-4" /> Update on WWJMRD
                      </Button>
                    )}

                    <Button
                      size="sm"
                      onClick={() => publishMutation.mutate(a.id)}
                      disabled={publishMutation.isPending}
                      className="gap-1"
                    >
                      <CheckCircle className="w-4 h-4" /> Publish
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm('Remove this article from the publishing queue?'))
                          removeMutation.mutate(a.id);
                      }}
                      disabled={removeMutation.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </DashboardLayout>
  );
}
