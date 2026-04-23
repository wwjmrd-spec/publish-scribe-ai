
CREATE OR REPLACE FUNCTION public.increment_plan_usage(
  p_user_id uuid,
  p_field text,
  p_usage_month text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- Ensure the unique constraint required by the upsert exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plan_usage_user_month_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.plan_usage
        ADD CONSTRAINT plan_usage_user_month_unique UNIQUE (user_id, usage_month);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      -- ignore if a duplicate already prevents the unique add
      NULL;
    END;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.increment_plan_usage(uuid, text, text) TO authenticated;
