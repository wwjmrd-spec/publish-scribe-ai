CREATE OR REPLACE FUNCTION public.compute_article_doi(ref text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN ref ~ '\d{3,}\s*$'
      THEN '10.67967/wwjmrd.' || (regexp_match(ref, '(\d{3,})\s*$'))[1]
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.set_article_doi_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.doi_number IS NULL OR btrim(NEW.doi_number) = '') AND NEW.reference_number IS NOT NULL THEN
    NEW.doi_number := public.compute_article_doi(NEW.reference_number);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_article_doi_number ON public.articles;
CREATE TRIGGER trg_set_article_doi_number
BEFORE INSERT OR UPDATE OF reference_number, doi_number ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.set_article_doi_number();

UPDATE public.articles
SET doi_number = public.compute_article_doi(reference_number)
WHERE (doi_number IS NULL OR btrim(doi_number) = '')
  AND reference_number IS NOT NULL
  AND public.compute_article_doi(reference_number) IS NOT NULL;