ALTER TABLE public.articles 
  ADD COLUMN IF NOT EXISTS formatting_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS formatted_document_url text,
  ADD COLUMN IF NOT EXISTS formatting_suggestions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS formatting_approved_at timestamptz;