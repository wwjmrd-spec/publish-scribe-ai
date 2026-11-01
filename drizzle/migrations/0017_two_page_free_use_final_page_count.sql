CREATE OR REPLACE FUNCTION public.auto_publish_queue_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Free article (<=2 pages) gets accepted: only when the admin has enabled
  -- 2-page free publication. page_count is the final (admin-correctable) count.
  IF NEW.status = 'manuscript_accepted'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND public.is_two_page_free_enabled()
     AND COALESCE(NEW.page_count, 0) > 0
     AND NEW.page_count <= 2 THEN
    NEW.in_publish_queue := true;
    NEW.publish_queue_added_at := COALESCE(NEW.publish_queue_added_at, now());
    NEW.status := 'free';
  END IF;

  IF NEW.status IN ('paid','free')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.in_publish_queue IS NOT TRUE THEN
    NEW.in_publish_queue := true;
    NEW.publish_queue_added_at := COALESCE(NEW.publish_queue_added_at, now());
  END IF;

  RETURN NEW;
END;
$function$;