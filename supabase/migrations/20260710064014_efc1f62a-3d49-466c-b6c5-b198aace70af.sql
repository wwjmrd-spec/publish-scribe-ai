
-- 1) Article edit lock flag (defaults true; auto-locked when published)
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS allow_author_edit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS edit_lock_reason text,
  ADD COLUMN IF NOT EXISTS edit_lock_updated_by uuid,
  ADD COLUMN IF NOT EXISTS edit_lock_updated_at timestamptz;

-- Auto-lock trigger: when article becomes published, lock author edits.
CREATE OR REPLACE FUNCTION public.auto_lock_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('published','published_to_wwjmrd')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.allow_author_edit IS DISTINCT FROM false THEN
    NEW.allow_author_edit := false;
    NEW.edit_lock_reason := COALESCE(NEW.edit_lock_reason, 'Auto-locked on publish');
    NEW.edit_lock_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_lock_on_publish ON public.articles;
CREATE TRIGGER trg_auto_lock_on_publish
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.auto_lock_on_publish();

-- Notify author when admin toggles lock/unlock
CREATE OR REPLACE FUNCTION public.notify_author_on_lock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.allow_author_edit IS DISTINCT FROM OLD.allow_author_edit THEN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      NEW.author_id,
      CASE WHEN NEW.allow_author_edit THEN 'Article unlocked ✏️' ELSE 'Article locked 🔒' END,
      CASE WHEN NEW.allow_author_edit
        THEN 'An admin unlocked "' || NEW.title || '" so you can edit or resubmit it.'
        ELSE 'Your article "' || NEW.title || '" is now locked. Contact the admin if you need changes.'
      END,
      'info',
      '/author/articles'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_author_on_lock_change ON public.articles;
CREATE TRIGGER trg_notify_author_on_lock_change
  AFTER UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.notify_author_on_lock_change();

-- 2) Review report download log
CREATE TABLE IF NOT EXISTS public.review_report_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  download_type text NOT NULL CHECK (download_type IN ('free','paid','pro','admin')),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.review_report_downloads TO authenticated;
GRANT ALL ON public.review_report_downloads TO service_role;

ALTER TABLE public.review_report_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors view their own report downloads" ON public.review_report_downloads;
CREATE POLICY "Authors view their own report downloads"
  ON public.review_report_downloads FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::user_role));

CREATE INDEX IF NOT EXISTS idx_rrd_article ON public.review_report_downloads(article_id);
CREATE INDEX IF NOT EXISTS idx_rrd_author  ON public.review_report_downloads(author_id, created_at DESC);
