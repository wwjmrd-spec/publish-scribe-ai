import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageLayout } from '@/components/layout/PageLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';

export default function PublicArticleAbstract() {
  const { reference } = useParams<{ reference: string }>();

  const { data: article, isLoading } = useQuery({
    queryKey: ['public-article', reference],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, reference_number, title, abstract, keywords, author_name, country, published_tier, publication_year, volume, issue, page_number, published_link, status')
        .eq('reference_number', reference!)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!reference,
  });

  const { data: coAuthors = [] } = useQuery({
    queryKey: ['public-article-coauthors', article?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('co_authors')
        .select('name, affiliation')
        .eq('article_id', article!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!article?.id,
  });

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-16 pt-28 max-w-3xl">
        <Link to="/publications">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Publications
          </Button>
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-12"><GlassSpinner size="lg" /></div>
        ) : !article ? (
          <GlassCard className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Article not found or not yet published.</p>
          </GlassCard>
        ) : (
          <GlassCard>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant={article.published_tier === 'free' ? 'secondary' : 'default'}>
                {article.published_tier === 'free' ? 'Free Access' : 'Paid Publication'}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">{article.reference_number}</span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold mb-3">{article.title}</h1>
            <p className="text-sm text-muted-foreground mb-4">
              {article.author_name}{article.country ? `, ${article.country}` : ''}
              {coAuthors.length > 0 && (
                <span>{', '}{coAuthors.map(c => c.name).join(', ')}</span>
              )}
            </p>
            <div className="text-xs text-muted-foreground mb-6">
              {article.publication_year && <>Year: <strong>{article.publication_year}</strong></>}
              {article.volume && <> · Volume: <strong>{article.volume}</strong></>}
              {article.issue && <> · Issue: <strong>{article.issue}</strong></>}
              {article.page_number && <> · Pages: <strong>{article.page_number}</strong></>}
            </div>

            <h2 className="font-display text-lg font-semibold mb-2">Abstract</h2>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line mb-6">
              {article.abstract || 'No abstract available.'}
            </p>

            {!!article.keywords?.length && (
              <>
                <h3 className="text-sm font-semibold mb-2">Keywords</h3>
                <div className="flex flex-wrap gap-2 mb-6">
                  {article.keywords.map((k) => (
                    <span key={k} className="text-xs px-2 py-1 rounded-full bg-[hsl(var(--glass-bg-strong))] border border-[hsl(var(--glass-border))]">{k}</span>
                  ))}
                </div>
              </>
            )}

            {article.published_link && (
              <a href={article.published_link} target="_blank" rel="noopener noreferrer">
                <Button>
                  <ExternalLink className="w-4 h-4 mr-2" /> View Full Article
                </Button>
              </a>
            )}
          </GlassCard>
        )}
      </div>
    </PageLayout>
  );
}
