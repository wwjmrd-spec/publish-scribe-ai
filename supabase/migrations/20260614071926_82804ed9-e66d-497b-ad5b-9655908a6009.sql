
-- 1) Tighten author update policy on articles with WITH CHECK restricting status escalation
DROP POLICY IF EXISTS "Authors can update their own articles" ON public.articles;
CREATE POLICY "Authors can update their own articles"
ON public.articles
FOR UPDATE
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (
  author_id = auth.uid()
  AND status NOT IN (
    'manuscript_accepted'::article_status,
    'pending_fee'::article_status,
    'paid'::article_status,
    'payment_under_review'::article_status,
    'failed_payment'::article_status,
    'published'::article_status,
    'copyright_received'::article_status
  )
);

-- 2) Public published-article view exposing only safe columns
DROP VIEW IF EXISTS public.published_articles_public;
CREATE VIEW public.published_articles_public
WITH (security_invoker = false) AS
SELECT
  id,
  reference_number,
  title,
  abstract,
  keywords,
  author_name,
  country,
  subject,
  publication_type,
  published_tier,
  publication_year,
  volume,
  issue,
  page_number,
  published_link,
  display_order,
  publish_queue_added_at,
  created_at,
  updated_at
FROM public.articles
WHERE status = 'published'::article_status;

REVOKE ALL ON public.published_articles_public FROM PUBLIC;
GRANT SELECT ON public.published_articles_public TO anon, authenticated;

-- 3) Remove anon direct table access to articles (view is the only public surface)
REVOKE ALL ON public.articles FROM anon;
