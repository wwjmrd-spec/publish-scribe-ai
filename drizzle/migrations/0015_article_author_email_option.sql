ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS include_author_emails boolean NOT NULL DEFAULT false;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS author_email text;
COMMENT ON COLUMN public.articles.include_author_emails IS 'When true, author emails are printed on the formatted article and sent to WWJMRD on publish.';
COMMENT ON COLUMN public.articles.author_email IS 'Main author email as printed on the article (may differ from the submitting account).';