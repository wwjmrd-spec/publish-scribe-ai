ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS min_cart_value numeric;

DROP FUNCTION IF EXISTS public.lookup_discount_code(text);
DROP FUNCTION IF EXISTS public.get_default_auto_apply_discount();

CREATE OR REPLACE FUNCTION public.lookup_discount_code(p_code text)
 RETURNS TABLE(id uuid, code text, discount_type discount_type, discount_value numeric, currency discount_currency, start_date timestamp with time zone, end_date timestamp with time zone, is_active boolean, applies_to text, article_position_limit text, specific_article_ids uuid[], usage_limit integer, used_count integer, max_uses_per_user integer, min_cart_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    dc.id, dc.code, dc.discount_type, dc.discount_value, dc.currency,
    dc.start_date, dc.end_date, dc.is_active, dc.applies_to,
    dc.article_position_limit, dc.specific_article_ids,
    dc.usage_limit, dc.used_count, dc.max_uses_per_user, dc.min_cart_value
  FROM public.discount_codes dc
  WHERE auth.uid() IS NOT NULL
    AND upper(dc.code) = upper(p_code)
    AND dc.is_active = true
    AND now() BETWEEN dc.start_date AND dc.end_date
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_default_auto_apply_discount()
 RETURNS TABLE(id uuid, code text, discount_type discount_type, discount_value numeric, currency discount_currency, start_date timestamp with time zone, end_date timestamp with time zone, is_active boolean, applies_to text, article_position_limit text, specific_article_ids uuid[], usage_limit integer, used_count integer, max_uses_per_user integer, min_cart_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT dc.id, dc.code, dc.discount_type, dc.discount_value, dc.currency,
         dc.start_date, dc.end_date, dc.is_active, dc.applies_to,
         dc.article_position_limit, dc.specific_article_ids,
         dc.usage_limit, dc.used_count, dc.max_uses_per_user, dc.min_cart_value
  FROM public.discount_codes dc
  WHERE auth.uid() IS NOT NULL
    AND dc.is_default = true
    AND dc.auto_apply = true
    AND dc.is_active = true
    AND now() BETWEEN dc.start_date AND dc.end_date
    AND (dc.usage_limit IS NULL OR dc.used_count < dc.usage_limit)
  LIMIT 1;
$function$;