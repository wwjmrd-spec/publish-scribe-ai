
DROP POLICY IF EXISTS "Anyone can view published articles" ON public.articles;
CREATE POLICY "Authenticated users can view published articles"
  ON public.articles FOR SELECT TO authenticated
  USING (status = 'published'::article_status);
REVOKE SELECT ON public.articles FROM anon;

REVOKE ALL ON public.co_authors FROM anon;

CREATE OR REPLACE VIEW public.co_authors_public
WITH (security_invoker = true) AS
SELECT ca.id, ca.article_id, ca.name, ca.affiliation
FROM public.co_authors ca
JOIN public.articles a ON a.id = ca.article_id
WHERE a.status = 'published'::article_status;

GRANT SELECT ON public.co_authors_public TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated users can view publication fees" ON public.publication_fees;
CREATE POLICY "Admins can view publication fees"
  ON public.publication_fees FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role));
REVOKE ALL ON public.publication_fees FROM anon;

CREATE OR REPLACE VIEW public.publication_fees_public AS
SELECT id, indian_fee, international_fee, indian_coauthor_fee,
       international_coauthor_fee, indian_pro_fee, international_pro_fee,
       indian_fast_track_fee, international_fast_track_fee,
       usdt_fee, usdt_fast_track_fee, usdt_coauthor_fee, usdt_pro_fee,
       updated_at
FROM public.publication_fees;

GRANT SELECT ON public.publication_fees_public TO authenticated;

DROP POLICY IF EXISTS "Admins can manage discount codes" ON public.discount_codes;
CREATE POLICY "Admins can manage discount codes"
  ON public.discount_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));
