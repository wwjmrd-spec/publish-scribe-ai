CREATE TABLE public.article_doi_fee_email_events (
  article_id uuid PRIMARY KEY REFERENCES public.articles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.article_doi_fee_email_events TO service_role;
ALTER TABLE public.article_doi_fee_email_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.queue_free_article_doi_fee_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'free' AND NEW.doi_paid IS NOT TRUE AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.article_doi_fee_email_events(article_id) VALUES (NEW.id) ON CONFLICT (article_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER queue_free_article_doi_fee_email_trigger AFTER INSERT OR UPDATE OF status ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.queue_free_article_doi_fee_email();
CREATE OR REPLACE FUNCTION public.claim_article_doi_fee_email_event()
RETURNS SETOF public.article_doi_fee_email_events LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.article_doi_fee_email_events e
  SET status = 'sending', claimed_at = now(), attempts = e.attempts + 1
  WHERE e.article_id = (
    SELECT q.article_id FROM public.article_doi_fee_email_events q
    WHERE (q.status = 'pending' AND q.available_at <= now()) OR (q.status = 'sending' AND q.claimed_at < now() - interval '15 minutes')
    ORDER BY q.created_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) RETURNING e.*;
$$;
REVOKE ALL ON FUNCTION public.claim_article_doi_fee_email_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_article_doi_fee_email_event() TO service_role;