
-- Grant SELECT to authenticated so admin RLS can return plan_usage rows via Data API
GRANT SELECT, INSERT, UPDATE ON public.plan_usage TO authenticated;
GRANT ALL ON public.plan_usage TO service_role;

-- Trigger: auto add to publish queue
-- 1) when an article with page_count <= 2 reaches 'manuscript_accepted', mark it as free + add to queue
-- 2) when an article's status changes to 'paid', add it to publish queue
CREATE OR REPLACE FUNCTION public.auto_publish_queue_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Free article (<=2 pages) gets accepted: queue immediately and mark paid (no fee).
  IF NEW.status = 'manuscript_accepted'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND COALESCE(NEW.page_count, 0) > 0
     AND NEW.page_count <= 2 THEN
    NEW.in_publish_queue := true;
    NEW.publish_queue_added_at := COALESCE(NEW.publish_queue_added_at, now());
    NEW.status := 'paid';
  END IF;

  -- Any article that becomes paid is queued for publishing.
  IF NEW.status = 'paid'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.in_publish_queue IS NOT TRUE THEN
    NEW.in_publish_queue := true;
    NEW.publish_queue_added_at := COALESCE(NEW.publish_queue_added_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_publish_queue_on_status ON public.articles;
CREATE TRIGGER trg_auto_publish_queue_on_status
BEFORE UPDATE OF status ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.auto_publish_queue_on_status();
