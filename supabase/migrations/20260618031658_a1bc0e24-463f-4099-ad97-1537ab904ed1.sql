DROP VIEW IF EXISTS public.published_articles_public;
CREATE VIEW public.published_articles_public
WITH (security_invoker = false) AS
SELECT id, reference_number, title, abstract, keywords, author_name, country,
       subject, publication_type, published_tier, publication_year, volume, issue,
       page_number, published_link, display_order, publish_queue_added_at,
       created_at, updated_at
FROM public.articles
WHERE status IN ('published'::article_status, 'published_to_wwjmrd'::article_status);
GRANT SELECT ON public.published_articles_public TO anon, authenticated;

DROP VIEW IF EXISTS public.co_authors_public;
CREATE VIEW public.co_authors_public
WITH (security_invoker = false) AS
SELECT ca.id, ca.article_id, ca.name, ca.affiliation
FROM public.co_authors ca
JOIN public.articles a ON a.id = ca.article_id
WHERE a.status IN ('published'::article_status, 'published_to_wwjmrd'::article_status);
GRANT SELECT ON public.co_authors_public TO anon, authenticated;