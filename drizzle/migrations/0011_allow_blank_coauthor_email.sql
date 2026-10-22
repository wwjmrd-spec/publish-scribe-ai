ALTER TABLE public.co_authors DROP CONSTRAINT IF EXISTS email_format_check;
ALTER TABLE public.co_authors ADD CONSTRAINT email_format_check CHECK (
  email = '' OR ((email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$') AND length(email) <= 254)
);
COMMENT ON COLUMN public.co_authors.email IS 'Co-author email; empty string when unknown (allowed for admin-entered co-authors).';