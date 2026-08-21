CREATE OR REPLACE FUNCTION public.enforce_author_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::user_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text NOT IN ('submitted','under_review','revised_submitted','withdrawn','update_under_process') THEN
    RAISE EXCEPTION 'Not allowed to set article status to %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;