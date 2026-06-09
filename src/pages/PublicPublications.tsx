import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageLayout } from '@/components/layout/PageLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Calendar } from 'lucide-react';

export function useRecentPublications(limit = 12) {
  return useQuery({
    queryKey: ['public-publications', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, reference_number, title, abstract, author_name, country, published_tier, publication_year, volume, issue, updated_at')
        .eq('status', 'published')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function PublicPublications() {
  const { data: items = [], isLoading } = useRecentPublications(60);

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-16 pt-28">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Home
          </Button>
        </Link>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-2 gradient-text">Recent Publications</h1>
        <p className="text-muted-foreground mb-8">Latest articles published in WWJMRD.</p>

        {isLoading ? (
          <div className="flex justify-center py-12"><GlassSpinner size="lg" /></div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No articles published yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to={`/articles/${encodeURIComponent(a.reference_number)}`}>
                  <GlassCard hover className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant={a.published_tier === 'free' ? 'secondary' : 'default'}>
                        {a.published_tier === 'free' ? 'Free' : 'Paid'}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">{a.reference_number}</span>
                    </div>
                    <h3 className="font-display text-lg font-semibold mb-2 line-clamp-3">{a.title}</h3>
                    {a.abstract && (
                      <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{a.abstract}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-[hsl(var(--glass-border))]">
                      <span className="truncate max-w-[60%]">{a.author_name || 'Unknown author'}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{a.publication_year || new Date(a.updated_at).getFullYear()}</span>
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

interface RecentPublicationsSectionProps {
  variant?: 'page' | 'embedded';
  limit?: number;
}

export function RecentPublicationsSection({ variant = 'page', limit = 6 }: RecentPublicationsSectionProps = {}) {
  const { data: items = [], isLoading } = useRecentPublications(limit);
  if (isLoading || items.length === 0) return null;

  const grid = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((a) => (
          <Link key={a.id} to={`/articles/${encodeURIComponent(a.reference_number)}`}>
            <GlassCard hover className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <Badge variant={a.published_tier === 'free' ? 'secondary' : 'default'}>
                  {a.published_tier === 'free' ? 'Free' : 'Paid'}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">{a.reference_number}</span>
              </div>
              <h3 className="font-display text-base font-semibold line-clamp-3 mb-2">{a.title}</h3>
              {a.abstract && <p className="text-xs text-muted-foreground line-clamp-3">{a.abstract}</p>}
              <div className="mt-auto pt-3 text-xs text-muted-foreground truncate">{a.author_name || ''}</div>
            </GlassCard>
          </Link>
        ))}
      </div>
      <div className="text-center mt-6">
        <Link to="/publications">
          <Button variant="outline">View All Publications</Button>
        </Link>
      </div>
    </>
  );

  if (variant === 'embedded') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Recent Publications</h2>
        </div>
        {grid}
      </div>
    );
  }

  return (
    <section className="py-20 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            Recent <span className="gradient-text">Publications</span>
          </h2>
          <p className="text-muted-foreground">Browse the latest research published in WWJMRD</p>
        </div>
        {grid}
      </div>
    </section>
  );
}
