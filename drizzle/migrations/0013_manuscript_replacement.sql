ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS allow_manuscript_replace boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manuscript_replaced_at timestamptz,
  ADD COLUMN IF NOT EXISTS manuscript_replaced_by uuid,
  ADD COLUMN IF NOT EXISTS manuscript_needs_reformat boolean NOT NULL DEFAULT false;

-- Only admins (or server code) may change the replacement permission/markers.
CREATE OR REPLACE FUNCTION public.protect_manuscript_replace_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::user_role) THEN
    RETURN NEW;
  END IF;
  NEW.allow_manuscript_replace := OLD.allow_manuscript_replace;
  NEW.manuscript_replaced_at := OLD.manuscript_replaced_at;
  NEW.manuscript_replaced_by := OLD.manuscript_replaced_by;
  NEW.manuscript_needs_reformat := OLD.manuscript_needs_reformat;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_manuscript_replace_fields ON public.articles;
CREATE TRIGGER trg_protect_manuscript_replace_fields
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.protect_manuscript_replace_fields();

-- Resubmission triggers skip the "restart the review" behaviour during an
-- editorial manuscript replacement (flag set by replace_article_manuscript).
CREATE OR REPLACE FUNCTION public.reset_reviews_on_resubmission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('app.manuscript_replace', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.document_url IS NOT NULL
     AND NEW.document_url IS DISTINCT FROM OLD.document_url THEN
    DELETE FROM public.article_reviews WHERE article_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.restart_automation_on_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.automation_paused := false;
    IF NEW.status IS NULL THEN
      NEW.status := 'submitted';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.automation_paused IS TRUE
     AND NEW.automation_paused IS NOT DISTINCT FROM OLD.automation_paused
     AND NEW.status::text NOT IN ('withdrawn','rejected','published','published_to_wwjmrd') THEN
    NEW.automation_paused := false;
  END IF;

  IF TG_OP = 'UPDATE'
     AND COALESCE(current_setting('app.manuscript_replace', true), '') <> 'on'
     AND NEW.document_url IS NOT NULL
     AND NEW.document_url IS DISTINCT FROM OLD.document_url THEN
    NEW.automation_paused := false;
    NEW.in_publish_queue := false;
    NEW.publish_queue_added_at := NULL;
    NEW.review_report_url := NULL;
    IF NEW.status::text IN ('rejected','revision_requested','revised_submitted',
                            'ai_review_generated','revised_review_generated',
                            'manuscript_accepted','pending_fee','paid','free',
                            'galley_proof_sent','galley_proof_approved','galley_proof_revised') THEN
      NEW.status := 'under_review';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admins_on_article_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_record RECORD;
  actor_name TEXT;
BEGIN
  actor_name := COALESCE(NEW.author_name, 'Unknown Author');

  IF COALESCE(current_setting('app.manuscript_replace', true), '') <> 'on'
     AND NEW.document_url IS NOT NULL
     AND NEW.document_url IS DISTINCT FROM OLD.document_url THEN
    FOR admin_record IN
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        admin_record.user_id,
        'Manuscript Updated / Resubmitted 🔄',
        'Author ' || actor_name || ' has submitted an updated manuscript for "' || NEW.title || '". Reference: ' || COALESCE(NEW.reference_number, 'N/A'),
        'info',
        '/admin/articles/' || NEW.id
      );
    END LOOP;
  END IF;

  IF NEW.galley_proof_status = 'revision_submitted'
     AND OLD.galley_proof_status IS DISTINCT FROM NEW.galley_proof_status
     AND NEW.galley_proof_revision_url IS NOT NULL THEN
    FOR admin_record IN
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        admin_record.user_id,
        'Revised Galley Proof Received 📝',
        'Author ' || actor_name || ' has submitted a revised galley proof for "' || NEW.title || '". Reference: ' || COALESCE(NEW.reference_number, 'N/A'),
        'info',
        '/admin/articles/' || NEW.id
      );
    END LOOP;
  END IF;

  IF NEW.galley_proof_status = 'approved'
     AND OLD.galley_proof_status IS DISTINCT FROM NEW.galley_proof_status THEN
    FOR admin_record IN
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        admin_record.user_id,
        'Galley Proof Approved ✅',
        'Author ' || actor_name || ' has approved the galley proof for "' || NEW.title || '". Reference: ' || COALESCE(NEW.reference_number, 'N/A'),
        'success',
        '/admin/articles/' || NEW.id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Atomic manuscript replacement used only by the replace-manuscript server function.
CREATE OR REPLACE FUNCTION public.replace_article_manuscript(
  p_article_id uuid,
  p_document_url text,
  p_title text,
  p_abstract text,
  p_keywords text[],
  p_subject text,
  p_reason_of_research text,
  p_author_name text,
  p_author_affiliation text,
  p_page_count integer,
  p_needs_reformat boolean,
  p_replaced_by uuid,
  p_revoke_author_permission boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_title IS NULL OR length(trim(p_title)) < 3 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  PERFORM set_config('app.manuscript_replace', 'on', true);
  UPDATE public.articles SET
    document_url = p_document_url,
    title = trim(p_title),
    original_title = NULL,
    abstract = NULLIF(trim(COALESCE(p_abstract, '')), ''),
    keywords = p_keywords,
    subject = NULLIF(trim(COALESCE(p_subject, '')), ''),
    reason_of_research = NULLIF(trim(COALESCE(p_reason_of_research, '')), ''),
    author_name = COALESCE(NULLIF(trim(COALESCE(p_author_name, '')), ''), author_name),
    author_affiliation = NULLIF(trim(COALESCE(p_author_affiliation, '')), ''),
    page_count = COALESCE(p_page_count, page_count),
    manuscript_replaced_at = now(),
    manuscript_replaced_by = p_replaced_by,
    manuscript_needs_reformat = p_needs_reformat,
    allow_manuscript_replace = CASE WHEN p_revoke_author_permission THEN false ELSE allow_manuscript_replace END
  WHERE id = p_article_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article not found';
  END IF;
  PERFORM set_config('app.manuscript_replace', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_article_manuscript(uuid, text, text, text, text[], text, text, text, text, integer, boolean, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_article_manuscript(uuid, text, text, text, text[], text, text, text, text, integer, boolean, uuid, boolean) TO service_role;