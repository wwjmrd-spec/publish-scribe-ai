ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS author_affiliation text;

UPDATE public.articles a
SET author_affiliation = p.affiliation
FROM public.profiles p
WHERE a.author_id = p.id
  AND a.author_affiliation IS NULL
  AND p.affiliation IS NOT NULL
  AND btrim(p.affiliation) <> '';

COMMENT ON COLUMN public.articles.author_affiliation IS 'Affiliation of the main author as written on the article; may differ from the submitting account profile.';