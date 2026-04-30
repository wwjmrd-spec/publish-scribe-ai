ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS formatted_docx_url TEXT;