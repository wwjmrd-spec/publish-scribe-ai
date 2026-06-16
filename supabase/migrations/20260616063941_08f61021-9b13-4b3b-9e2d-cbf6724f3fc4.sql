
-- 1. Remove broad authenticated SELECT on articles (was exposing internal workflow columns)
DROP POLICY IF EXISTS "Authenticated users can view published articles" ON public.articles;

-- 2. Recreate published_articles_public as a SECURITY DEFINER-style view (owner=postgres bypasses RLS)
--    so anon + authenticated can browse published articles via the column-filtered view only.
DROP VIEW IF EXISTS public.published_articles_public;
CREATE VIEW public.published_articles_public
WITH (security_invoker = false) AS
SELECT id, reference_number, title, abstract, keywords, author_name, country,
       subject, publication_type, published_tier, publication_year, volume, issue,
       page_number, published_link, display_order, publish_queue_added_at,
       created_at, updated_at
FROM public.articles
WHERE status = 'published'::article_status;
GRANT SELECT ON public.published_articles_public TO anon, authenticated;

-- 3. Same pattern for co_authors_public so co-author emails/phones are never exposed to authenticated users at large.
DROP VIEW IF EXISTS public.co_authors_public;
CREATE VIEW public.co_authors_public
WITH (security_invoker = false) AS
SELECT ca.id, ca.article_id, ca.name, ca.affiliation
FROM public.co_authors ca
JOIN public.articles a ON a.id = ca.article_id
WHERE a.status = 'published'::article_status;
GRANT SELECT ON public.co_authors_public TO anon, authenticated;

-- 4. publication_fees_public must also stay SECURITY DEFINER (table is admin-only); explicit.
DROP VIEW IF EXISTS public.publication_fees_public;
CREATE VIEW public.publication_fees_public
WITH (security_invoker = false) AS
SELECT id, indian_fee, international_fee, indian_coauthor_fee, international_coauthor_fee,
       indian_pro_fee, international_pro_fee, indian_fast_track_fee, international_fast_track_fee,
       usdt_fee, usdt_fast_track_fee, usdt_coauthor_fee, usdt_pro_fee, updated_at
FROM public.publication_fees;
GRANT SELECT ON public.publication_fees_public TO authenticated;

-- 5. Storage: let authors read their own formatted article files (not just galley proofs)
DROP POLICY IF EXISTS "Authors can read their formatted article files" ON storage.objects;
CREATE POLICY "Authors can read their formatted article files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'formatted-articles'
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.author_id = auth.uid()
      AND (storage.foldername(name))[1] = a.id::text
  )
);
