import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Share2, Search } from 'lucide-react';
import { PublicationCard } from '@/components/articles/PublicationCard';
import { toast } from 'sonner';

interface PubRow {
  id: string;
  reference_number: string | null;
  title: string;
  author_id: string | null;
  author_name: string | null;
  country: string | null;
  publication_year: string | null;
  volume: string | null;
  issue: string | null;
  page_number: string | null;
  published_link: string | null;
  keywords: string[] | null;
  abstract: string | null;
  status: string;
}

export default function AdminPublicationCards() {
  const [rows, setRows] = useState<PubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from('articles')
        .select(
          'id, reference_number, title, author_name, country, publication_year, volume, issue, page_number, published_link, keywords, abstract, status, created_at',
        )
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        toast.error('Failed to load publications');
      } else {
        setRows((data || []) as any);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      r.title?.toLowerCase().includes(s) ||
      r.reference_number?.toLowerCase().includes(s) ||
      r.author_name?.toLowerCase().includes(s)
    );
  });

  return (
    <DashboardLayout type="admin">
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Publication Cards</h1>
          <p className="text-sm text-muted-foreground">
            View, download and share cards for every published article.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search title, reference, author…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {filtered.length} of {rows.length}
          </div>
        </div>

        {loading ? (
          <GlassCard className="p-6 text-sm text-muted-foreground">Loading publications…</GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-6 text-sm text-muted-foreground">
            No published articles yet.
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <GlassCard key={r.id} className="p-4">
                <Collapsible>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground">
                        {r.reference_number || r.id} · {r.status}
                      </div>
                      <div className="font-semibold truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.author_name}
                        {r.country ? ` · ${r.country}` : ''}
                      </div>
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Share2 className="w-4 h-4 mr-1" /> Card
                        <ChevronDown className="w-4 h-4 ml-1 transition-transform data-[state=open]:rotate-180" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="pt-4">
                    <PublicationCard article={r} />
                  </CollapsibleContent>
                </Collapsible>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
