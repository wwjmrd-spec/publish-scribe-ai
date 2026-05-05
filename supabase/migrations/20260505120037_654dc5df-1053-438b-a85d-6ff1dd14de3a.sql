-- 1. Restrict plan_usage: drop user-facing INSERT/UPDATE so usage cannot be reset client-side
DROP POLICY IF EXISTS "Users can insert their own usage" ON public.plan_usage;
DROP POLICY IF EXISTS "Users can update their own usage" ON public.plan_usage;

-- 2. Add ownership check inside increment_plan_usage RPC
CREATE OR REPLACE FUNCTION public.increment_plan_usage(p_user_id uuid, p_field text, p_usage_month text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::user_role) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_field NOT IN ('review_reports_used', 'coauthor_certs_used') THEN
    RAISE EXCEPTION 'Invalid field: %', p_field;
  END IF;

  INSERT INTO public.plan_usage (user_id, usage_month, review_reports_used, coauthor_certs_used)
  VALUES (
    p_user_id,
    p_usage_month,
    CASE WHEN p_field = 'review_reports_used' THEN 1 ELSE 0 END,
    CASE WHEN p_field = 'coauthor_certs_used' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, usage_month) DO UPDATE
  SET
    review_reports_used = public.plan_usage.review_reports_used
      + CASE WHEN p_field = 'review_reports_used' THEN 1 ELSE 0 END,
    coauthor_certs_used = public.plan_usage.coauthor_certs_used
      + CASE WHEN p_field = 'coauthor_certs_used' THEN 1 ELSE 0 END,
    updated_at = now();
END;
$$;

-- 3. Revoke EXECUTE from anon for SECURITY DEFINER functions that should not be public
REVOKE EXECUTE ON FUNCTION public.increment_plan_usage(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.increment_plan_usage(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, user_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, user_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

-- 4. Tighten user_roles self-insert: only authenticated users, only 'author' role for self
DROP POLICY IF EXISTS "Users can insert their own author role" ON public.user_roles;
CREATE POLICY "Authenticated users can self-assign author role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'author'::user_role);

-- 5. Restrict discount_codes column exposure to authenticated users (hide internal fields)
REVOKE SELECT ON public.discount_codes FROM authenticated, anon;
GRANT SELECT (
  id, code, discount_type, discount_value, currency, start_date, end_date,
  usage_limit, used_count, is_active, applies_to, article_position_limit,
  specific_article_ids, max_uses_per_user
) ON public.discount_codes TO authenticated;

-- 6. Storage: remove overly broad SELECT on formatted-articles bucket
DROP POLICY IF EXISTS "Authenticated users can read formatted articles" ON storage.objects;

-- Add a narrowly-scoped policy: authors can read formatted/galley files for their own articles
CREATE POLICY "Authors can read formatted files for their articles"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'formatted-articles'
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.author_id = auth.uid()
      AND (
        position(a.id::text in name) > 0
        OR position(a.reference_number in name) > 0
      )
  )
);
