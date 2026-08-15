ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS orcid text;
ALTER TABLE public.co_authors ADD COLUMN IF NOT EXISTS orcid text;