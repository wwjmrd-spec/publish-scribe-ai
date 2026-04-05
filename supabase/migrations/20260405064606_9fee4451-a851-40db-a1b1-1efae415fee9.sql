-- Withdraw duplicate articles, keeping only the oldest per normalized title
WITH ranked AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY created_at ASC) as rn
  FROM public.articles
  WHERE status != 'withdrawn'
)
UPDATE public.articles 
SET status = 'withdrawn'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Now create the unique index
CREATE UNIQUE INDEX unique_article_title_normalized 
ON public.articles (LOWER(TRIM(title))) 
WHERE status != 'withdrawn';