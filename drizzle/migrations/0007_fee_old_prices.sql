ALTER TABLE public.publication_fees
  ADD COLUMN IF NOT EXISTS old_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS show_old_price boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS new_price_label text;
CREATE OR REPLACE VIEW public.publication_fees_public AS
SELECT id, indian_fee, international_fee, indian_coauthor_fee, international_coauthor_fee,
  indian_pro_fee, international_pro_fee, indian_fast_track_fee, international_fast_track_fee,
  usdt_fee, usdt_fast_track_fee, usdt_coauthor_fee, usdt_pro_fee,
  indian_doi_fee, international_doi_fee, usdt_doi_fee, updated_at,
  old_prices, show_old_price, new_price_label
FROM public.publication_fees;
GRANT SELECT ON public.publication_fees_public TO anon, authenticated;