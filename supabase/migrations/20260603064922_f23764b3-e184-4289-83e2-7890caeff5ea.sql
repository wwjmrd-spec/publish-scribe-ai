ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS author_revision_html text,
  ADD COLUMN IF NOT EXISTS author_revision_submitted_at timestamptz;