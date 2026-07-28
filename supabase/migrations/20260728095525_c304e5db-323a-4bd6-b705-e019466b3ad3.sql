ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'update_under_process';
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'updated_published';

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS author_edits_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS author_details_changed_once boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS author_update_html text,
  ADD COLUMN IF NOT EXISTS author_update_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS author_update_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS author_update_notes text;

CREATE OR REPLACE FUNCTION public.notify_admins_on_author_update_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  IF NEW.author_update_status = 'pending'
     AND OLD.author_update_status IS DISTINCT FROM NEW.author_update_status THEN
    FOR admin_record IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        admin_record.user_id,
        'Author Update Request 📝',
        COALESCE(NEW.author_name, 'An author') || ' submitted changes for "' || NEW.title || '". Reference: ' || COALESCE(NEW.reference_number, 'N/A'),
        'info',
        '/admin/articles/' || NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_author_update_request ON public.articles;
CREATE TRIGGER trg_notify_admins_on_author_update_request
AFTER UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_author_update_request();