ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_autocorrected boolean NOT NULL DEFAULT false;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ai_autocorrected_at timestamp with time zone;