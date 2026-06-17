ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'published_to_wwjmrd';

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS wwjmrd_article_id integer,
  ADD COLUMN IF NOT EXISTS published_to_wwjmrd_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.restart_automation_on_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- New submission: ensure automation starts.
  IF TG_OP = 'INSERT' THEN
    NEW.automation_paused := false;
    IF NEW.status IS NULL THEN
      NEW.status := 'submitted';
    END IF;
    RETURN NEW;
  END IF;

  -- If an admin/user manually changes status while automation is paused, resume it.
  -- Explicit pause/resume toggle still wins because automation_paused itself changes in that update.
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.automation_paused IS TRUE
     AND NEW.automation_paused IS NOT DISTINCT FROM OLD.automation_paused
     AND NEW.status::text NOT IN ('withdrawn','rejected','published','published_to_wwjmrd') THEN
    NEW.automation_paused := false;
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
    IF NEW.status::text IN ('rejected','revision_requested','revised_submitted',
                            'ai_review_generated','revised_review_generated',
                            'manuscript_accepted','pending_fee','paid','free',
                            'galley_proof_sent','galley_proof_approved','galley_proof_revised') THEN
      NEW.status := 'under_review';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_articles_published_to_wwjmrd_at
  ON public.articles (published_to_wwjmrd_at)
  WHERE published_to_wwjmrd_at IS NOT NULL;