
ALTER VIEW public.published_articles_public SET (security_invoker = true);

-- Grant column-level SELECT on only the safe public columns to anon and authenticated.
GRANT SELECT (
  id, reference_number, title, abstract, keywords, author_name, country,
  subject, publication_type, published_tier, publication_year, volume, issue,
  page_number, published_link, display_order, publish_queue_added_at,
  created_at, updated_at, status
) ON public.articles TO anon;
