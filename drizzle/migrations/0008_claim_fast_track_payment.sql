CREATE OR REPLACE FUNCTION public.claim_fast_track_payment(_article_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _article record;
  _payment record;
  _has_doi boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, created_at INTO _article
  FROM public.articles
  WHERE id = _article_id AND author_id = _uid AND publication_type = 'fast_track';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('linked', false, 'doi_paid', false);
  END IF;

  -- If this article already has its Fast Track payment, report its DOI state.
  IF EXISTS (SELECT 1 FROM public.payments WHERE user_id = _uid AND _article_id = ANY(article_ids)
             AND payment_items @> '[{"type":"fast_track_fee"}]'::jsonb) THEN
    RETURN jsonb_build_object('linked', true,
      'doi_paid', (SELECT doi_paid FROM public.articles WHERE id = _article_id));
  END IF;

  SELECT id, payment_items INTO _payment
  FROM public.payments
  WHERE user_id = _uid
    AND payment_status = 'success'
    AND COALESCE(array_length(article_ids, 1), 0) = 0
    AND payment_items @> '[{"type":"fast_track_fee"}]'::jsonb
    AND created_at > _article.created_at - interval '6 hours'
    AND created_at <= _article.created_at + interval '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('linked', false, 'doi_paid', false);
  END IF;

  UPDATE public.payments SET article_ids = ARRAY[_article_id] WHERE id = _payment.id;

  _has_doi := _payment.payment_items @> '[{"type":"doi"}]'::jsonb;
  IF _has_doi THEN
    UPDATE public.articles
    SET doi_requested = true, doi_paid = true, doi_paid_at = now()
    WHERE id = _article_id;
  END IF;

  RETURN jsonb_build_object('linked', true, 'doi_paid', _has_doi);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_fast_track_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_fast_track_payment(uuid) TO authenticated;