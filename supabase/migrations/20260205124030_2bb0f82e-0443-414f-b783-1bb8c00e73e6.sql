-- Add publication details for certificate generation
ALTER TABLE public.articles 
ADD COLUMN IF NOT EXISTS volume TEXT,
ADD COLUMN IF NOT EXISTS issue TEXT,
ADD COLUMN IF NOT EXISTS page_number TEXT,
ADD COLUMN IF NOT EXISTS publication_year TEXT;

-- Create table for AI article reviews
CREATE TABLE IF NOT EXISTS public.article_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL DEFAULT 'ai',
  plagiarism_score NUMERIC,
  grammar_score NUMERIC,
  content_score NUMERIC,
  overall_score NUMERIC,
  summary TEXT,
  detailed_feedback JSONB,
  reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS on article_reviews
ALTER TABLE public.article_reviews ENABLE ROW LEVEL SECURITY;

-- Admins can manage all reviews
CREATE POLICY "Admins can manage all reviews"
ON public.article_reviews
FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));

-- Authors can view reviews of their own articles
CREATE POLICY "Authors can view their article reviews"
ON public.article_reviews
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.articles 
    WHERE articles.id = article_reviews.article_id 
    AND articles.author_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_article_reviews_article_id ON public.article_reviews(article_id);