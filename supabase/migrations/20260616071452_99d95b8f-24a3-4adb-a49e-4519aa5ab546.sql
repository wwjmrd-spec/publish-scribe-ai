
-- 1) Update the auto-publish-queue trigger to use 'free' for 2-page articles
CREATE OR REPLACE FUNCTION public.auto_publish_queue_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Free article (<=2 pages) gets accepted: queue immediately and mark FREE (no fee).
  IF NEW.status = 'manuscript_accepted'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND COALESCE(NEW.page_count, 0) > 0
     AND NEW.page_count <= 2 THEN
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

-- 2) Restart automation when a manuscript is freshly submitted or revised
CREATE OR REPLACE FUNCTION public.restart_automation_on_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- New submission: ensure automation runs.
  IF TG_OP = 'INSERT' THEN
    NEW.automation_paused := false;
    IF NEW.status IS NULL OR NEW.status = 'submitted' THEN
      NEW.status := 'submitted';
    END IF;
    RETURN NEW;
  END IF;

  -- Author uploaded a new document for an existing article OR resubmitted text.
  IF TG_OP = 'UPDATE'
     AND NEW.document_url IS NOT NULL
     AND NEW.document_url IS DISTINCT FROM OLD.document_url THEN
    NEW.automation_paused := false;
    NEW.in_publish_queue := false;
    NEW.publish_queue_added_at := NULL;
    NEW.review_report_url := NULL;
    -- Move back into the review pipeline so the cron job picks it up.
    IF NEW.status IN ('rejected','revision_requested','revised_submitted',
                      'ai_review_generated','revised_review_generated',
                      'manuscript_accepted','pending_fee') THEN
      NEW.status := 'under_review';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_restart_automation_on_submission ON public.articles;
CREATE TRIGGER trg_restart_automation_on_submission
  BEFORE INSERT OR UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.restart_automation_on_submission();

-- 3) When document_url changes on UPDATE, clear any prior review approvals so
--    the cron will trigger a fresh AI review.
CREATE OR REPLACE FUNCTION public.reset_reviews_on_resubmission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.document_url IS NOT NULL
     AND NEW.document_url IS DISTINCT FROM OLD.document_url THEN
    DELETE FROM public.article_reviews WHERE article_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reset_reviews_on_resubmission ON public.articles;
CREATE TRIGGER trg_reset_reviews_on_resubmission
  AFTER UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_reviews_on_resubmission();
