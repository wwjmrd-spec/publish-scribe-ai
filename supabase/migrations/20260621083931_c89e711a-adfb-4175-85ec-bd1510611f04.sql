ALTER TABLE public.discount_codes ADD COLUMN IF NOT EXISTS show_in_cart boolean NOT NULL DEFAULT false;

CREATE POLICY "Authenticated can view cart-visible discount codes"
ON public.discount_codes
FOR SELECT
TO authenticated
USING (
  show_in_cart = true
  AND is_active = true
  AND now() BETWEEN start_date AND end_date
);