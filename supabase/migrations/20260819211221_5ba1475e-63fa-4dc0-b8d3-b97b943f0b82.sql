ALTER TABLE public.publication_fees
  ADD COLUMN IF NOT EXISTS indian_doi_fee numeric DEFAULT 500,
  ADD COLUMN IF NOT EXISTS international_doi_fee numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS usdt_doi_fee numeric DEFAULT 10;

UPDATE public.publication_fees
  SET indian_doi_fee = COALESCE(indian_doi_fee, 500),
      international_doi_fee = COALESCE(international_doi_fee, 10),
      usdt_doi_fee = COALESCE(usdt_doi_fee, 10);

DROP VIEW IF EXISTS public.publication_fees_public;
CREATE VIEW public.publication_fees_public AS
SELECT id,
    indian_fee,
    international_fee,
    indian_coauthor_fee,
    international_coauthor_fee,
    indian_pro_fee,
    international_pro_fee,
    indian_fast_track_fee,
    international_fast_track_fee,
    usdt_fee,
    usdt_fast_track_fee,
    usdt_coauthor_fee,
    usdt_pro_fee,
    indian_doi_fee,
    international_doi_fee,
    usdt_doi_fee,
    updated_at
FROM public.publication_fees;

GRANT SELECT ON public.publication_fees_public TO anon, authenticated;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS doi_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doi_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doi_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS doi_number text;

CREATE TABLE IF NOT EXISTS public.legacy_doi_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  article_title text NOT NULL,
  reference_number text,
  published_link text,
  notes text,
  amount numeric,
  currency text,
  payment_id uuid,
  status text NOT NULL DEFAULT 'pending',
  doi_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.legacy_doi_requests TO authenticated;
GRANT ALL ON public.legacy_doi_requests TO service_role;

ALTER TABLE public.legacy_doi_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors view own legacy DOI requests" ON public.legacy_doi_requests;
CREATE POLICY "Authors view own legacy DOI requests"
  ON public.legacy_doi_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authors create own legacy DOI requests" ON public.legacy_doi_requests;
CREATE POLICY "Authors create own legacy DOI requests"
  ON public.legacy_doi_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins update legacy DOI requests" ON public.legacy_doi_requests;
CREATE POLICY "Admins update legacy DOI requests"
  ON public.legacy_doi_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));