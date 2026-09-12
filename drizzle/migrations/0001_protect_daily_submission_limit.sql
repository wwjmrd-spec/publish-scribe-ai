CREATE OR REPLACE FUNCTION public.protect_daily_submission_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.daily_submission_limit IS DISTINCT FROM OLD.daily_submission_limit
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.user_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only administrators can change article submission limits';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_daily_submission_limit_before_update
BEFORE UPDATE OF daily_submission_limit ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_daily_submission_limit();