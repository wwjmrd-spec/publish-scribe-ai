ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS author_declared_page_count integer;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS detected_page_count integer;
COMMENT ON COLUMN public.articles.author_declared_page_count IS 'Number of pages the author stated on the submission form.';
COMMENT ON COLUMN public.articles.detected_page_count IS 'Number of pages detected automatically from the uploaded manuscript.';

CREATE OR REPLACE FUNCTION public.is_two_page_free_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT setting_value = 'true' FROM public.admin_settings WHERE setting_key = 'two_page_free_enabled' LIMIT 1), false)
$$;
GRANT EXECUTE ON FUNCTION public.is_two_page_free_enabled() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_publish_queue_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Free article (<=2 pages) gets accepted: only when the admin has enabled
  -- 2-page free publication. Queue immediately and mark FREE (no fee).
  IF NEW.status = 'manuscript_accepted'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND public.is_two_page_free_enabled()
     AND COALESCE(NEW.page_count, 0) > 0
     AND NEW.page_count <= 2
     AND COALESCE(NEW.author_declared_page_count, NEW.page_count) <= 2 THEN
    NEW.in_publish_queue := true;
    NEW.publish_queue_added_at := COALESCE(NEW.publish_queue_added_at, now());
    NEW.status := 'free';
  END IF;

  -- Any article that becomes paid OR free is queued for publishing.
  IF NEW.status IN ('paid','free')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.in_publish_queue IS NOT TRUE THEN
    NEW.in_publish_queue := true;
    NEW.publish_queue_added_at := COALESCE(NEW.publish_queue_added_at, now());
  END IF;

  RETURN NEW;
END;
$function$;