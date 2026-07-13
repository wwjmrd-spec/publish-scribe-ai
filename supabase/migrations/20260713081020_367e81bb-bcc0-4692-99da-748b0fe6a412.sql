
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_apply boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_only_one_default
  ON public.discount_codes ((true)) WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.enforce_single_default_discount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.discount_codes
      SET is_default = false
      WHERE is_default = true
        AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_default_discount ON public.discount_codes;
CREATE TRIGGER trg_enforce_single_default_discount
  BEFORE INSERT OR UPDATE OF is_default ON public.discount_codes
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.enforce_single_default_discount();

CREATE OR REPLACE FUNCTION public.get_default_auto_apply_discount()
RETURNS TABLE(
  id uuid,
  code text,
  discount_type discount_type,
  discount_value numeric,
  currency discount_currency,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean,
  applies_to text,
  article_position_limit text,
  specific_article_ids uuid[],
  usage_limit integer,
  used_count integer,
  max_uses_per_user integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dc.id, dc.code, dc.discount_type, dc.discount_value, dc.currency,
         dc.start_date, dc.end_date, dc.is_active, dc.applies_to,
         dc.article_position_limit, dc.specific_article_ids,
         dc.usage_limit, dc.used_count, dc.max_uses_per_user
  FROM public.discount_codes dc
  WHERE auth.uid() IS NOT NULL
    AND dc.is_default = true
    AND dc.auto_apply = true
    AND dc.is_active = true
    AND now() BETWEEN dc.start_date AND dc.end_date
    AND (dc.usage_limit IS NULL OR dc.used_count < dc.usage_limit)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_default_auto_apply_discount() TO authenticated;
