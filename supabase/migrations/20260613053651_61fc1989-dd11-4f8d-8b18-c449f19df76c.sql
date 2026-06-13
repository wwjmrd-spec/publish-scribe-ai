
-- 1) Restrict anon access on articles to a safe column set; authenticated/service_role keep full access.
REVOKE ALL ON public.articles FROM anon;
GRANT SELECT (
  id, reference_number, title, abstract, keywords, author_name, country,
  subject, published_link, publication_year, page_number, issue, volume,
  status, created_at, updated_at, submission_date, publication_type,
  display_order, page_count, publish_queue_added_at, author_id
) ON public.articles TO anon;

-- 2) co_authors: existing SELECT policies already scope to article owner / admin.
-- Remove anon access entirely since the public archive does not need it.
REVOKE ALL ON public.co_authors FROM anon;

-- 3) discount_codes: remove the broad "users can view codes they own" policy
-- and revoke anon access. Only admins should ever read codes.
DROP POLICY IF EXISTS "Users can view discount codes they own" ON public.discount_codes;
REVOKE ALL ON public.discount_codes FROM anon;
