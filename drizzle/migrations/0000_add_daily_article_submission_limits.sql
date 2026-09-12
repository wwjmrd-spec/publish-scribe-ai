ALTER TABLE public.profiles
ADD COLUMN daily_submission_limit integer NOT NULL DEFAULT 5;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_daily_submission_limit_nonnegative
CHECK (daily_submission_limit >= 0);

CREATE OR REPLACE FUNCTION public.get_article_submission_quota(_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(daily_limit integer, used integer, remaining integer, window_started_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester uuid := auth.uid();
  configured_limit integer;
  used_count integer;
BEGIN
  IF requester IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _user_id IS DISTINCT FROM requester
     AND NOT public.has_role(requester, 'admin'::public.user_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT p.daily_submission_limit
  INTO configured_limit
  FROM public.profiles p
  WHERE p.id = _user_id;

  IF configured_limit IS NULL THEN
    RAISE EXCEPTION 'Author profile not found';
  END IF;

  SELECT count(*)::integer
  INTO used_count
  FROM public.articles a
  WHERE a.author_id = _user_id
    AND a.created_at >= now() - interval '24 hours'
    AND coalesce(a.created_via, 'manual') <> 'admin';

  RETURN QUERY SELECT
    configured_limit,
    used_count,
    greatest(configured_limit - used_count, 0),
    now() - interval '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_article_submission_quota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_article_submission_quota(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_article_submission_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_limit integer;
  used_count integer;
  requester uuid := auth.uid();
BEGIN
  IF requester IS NULL
     OR public.has_role(requester, 'admin'::public.user_role)
     OR coalesce(NEW.created_via, 'manual') = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.author_id IS DISTINCT FROM requester THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.author_id::text, 0));

  SELECT p.daily_submission_limit
  INTO configured_limit
  FROM public.profiles p
  WHERE p.id = NEW.author_id;

  configured_limit := coalesce(configured_limit, 5);

  SELECT count(*)::integer
  INTO used_count
  FROM public.articles a
  WHERE a.author_id = NEW.author_id
    AND a.created_at >= now() - interval '24 hours'
    AND coalesce(a.created_via, 'manual') <> 'admin';

  IF used_count >= configured_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DAILY_ARTICLE_SUBMISSION_LIMIT_REACHED',
      DETAIL = format('You have submitted %s of %s allowed articles in the last 24 hours.', used_count, configured_limit),
      HINT = 'To request a limit increase, email support@wwjmrd.com.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_article_submission_limit_before_insert
BEFORE INSERT ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_article_submission_limit();