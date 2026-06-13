
-- Restore anon SELECT on full articles row (RLS limits to published rows anyway).
GRANT SELECT ON public.articles TO anon;

-- Restore anon SELECT on co_authors (RLS limits visibility per policies).
GRANT SELECT ON public.co_authors TO anon;

-- Restore authenticated SELECT on discount_codes via owner policy.
CREATE POLICY "Users can view discount codes they own"
ON public.discount_codes
FOR SELECT
TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::user_role));
