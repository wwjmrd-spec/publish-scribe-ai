CREATE OR REPLACE FUNCTION public.record_manual_doi_payment(
  p_article_id uuid,
  p_author_id uuid,
  p_amount numeric,
  p_currency public.currency_type,
  p_gateway public.payment_gateway,
  p_transaction_id text,
  p_paid_at timestamptz,
  p_notes text DEFAULT NULL,
  p_doi_number text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article public.articles%ROWTYPE;
  v_payment_id uuid;
  v_doi text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.user_role) THEN
    RAISE EXCEPTION 'Only admins can record DOI payments';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_paid_at IS NULL OR p_paid_at > now() THEN
    RAISE EXCEPTION 'Enter a positive amount and a valid payment date';
  END IF;
  SELECT * INTO v_article FROM public.articles WHERE id = p_article_id FOR UPDATE;
  IF NOT FOUND OR v_article.author_id IS DISTINCT FROM p_author_id THEN
    RAISE EXCEPTION 'Select an article belonging to this author';
  END IF;
  IF v_article.doi_paid THEN
    RAISE EXCEPTION 'The DOI fee for this article is already paid';
  END IF;
  v_doi := coalesce(nullif(btrim(p_doi_number), ''), nullif(btrim(v_article.doi_number), ''), public.compute_article_doi(v_article.reference_number));
  IF v_doi IS NULL OR v_doi !~ '^10\.[0-9]{4,9}/[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Enter a valid DOI number, such as 10.67967/wwjmrd.0426';
  END IF;
  INSERT INTO public.payments (user_id, article_ids, amount, final_amount, currency, payment_gateway, payment_status, payment_items, transaction_id, created_at)
  VALUES (p_author_id, ARRAY[p_article_id], p_amount, p_amount, p_currency, p_gateway, 'success',
    jsonb_build_array(jsonb_build_object('type', 'doi', 'articleId', p_article_id, 'manual', true, 'notes', p_notes)),
    coalesce(nullif(btrim(p_transaction_id), ''), 'MANUAL-DOI-' || gen_random_uuid()::text), p_paid_at)
  RETURNING id INTO v_payment_id;
  UPDATE public.articles SET doi_requested = true, doi_paid = true, doi_paid_at = p_paid_at, doi_number = v_doi WHERE id = p_article_id;
  RETURN v_payment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_manual_doi_payment(uuid, uuid, numeric, public.currency_type, public.payment_gateway, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_manual_doi_payment(uuid, uuid, numeric, public.currency_type, public.payment_gateway, text, timestamptz, text, text) TO authenticated;
COMMENT ON FUNCTION public.record_manual_doi_payment(uuid, uuid, numeric, public.currency_type, public.payment_gateway, text, timestamptz, text, text) IS 'Admin-only atomic DOI payment and assignment; preserves article publication status.';