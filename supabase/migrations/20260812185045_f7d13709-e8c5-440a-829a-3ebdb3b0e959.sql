CREATE OR REPLACE FUNCTION public.set_fee_promise(p_article_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_status article_status;
BEGIN
  SELECT author_id, status INTO v_owner, v_status
  FROM public.articles WHERE id = p_article_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Article not found';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_owner AND NOT public.has_role(auth.uid(), 'admin'::user_role) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF v_status NOT IN ('manuscript_accepted'::article_status, 'pending_fee'::article_status) THEN
    RAISE EXCEPTION 'Fee date can only be set while the article awaits fee payment';
  END IF;

  IF p_date IS NOT NULL AND (p_date < CURRENT_DATE OR p_date > date_trunc('month', CURRENT_DATE)::date + 24) THEN
    RAISE EXCEPTION 'Invalid date';
  END IF;

  UPDATE public.articles
  SET fee_promise_date = p_date,
      fee_promise_status = CASE WHEN p_date IS NULL THEN 'skipped' ELSE 'set' END,
      updated_at = now()
  WHERE id = p_article_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_fee_promise(uuid, date) TO authenticated;