
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS missing_sections TEXT[],
  ADD COLUMN IF NOT EXISTS missing_section_samples JSONB;

-- Allow the RPC to be safely called from edge functions (service role) OR the owning user.
CREATE OR REPLACE FUNCTION public.increment_plan_usage(p_user_id uuid, p_field text, p_usage_month text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- auth.uid() is NULL when invoked with the service role from edge functions; allow that.
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::user_role) THEN
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
$function$;
