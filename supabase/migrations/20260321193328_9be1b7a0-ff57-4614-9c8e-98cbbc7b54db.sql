
ALTER TABLE public.articles 
  ADD COLUMN IF NOT EXISTS galley_proof_word_url TEXT,
  ADD COLUMN IF NOT EXISTS galley_proof_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS galley_proof_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS galley_proof_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS galley_proof_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS galley_proof_revision_url TEXT,
  ADD COLUMN IF NOT EXISTS galley_proof_consent BOOLEAN DEFAULT false;
