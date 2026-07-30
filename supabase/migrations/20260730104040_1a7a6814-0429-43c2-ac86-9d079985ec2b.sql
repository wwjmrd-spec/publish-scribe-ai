CREATE OR REPLACE FUNCTION public.notify_admins_on_article_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_record RECORD;
  actor_name TEXT;
BEGIN
  actor_name := COALESCE(NEW.author_name, 'Unknown Author');

  -- Any new/updated manuscript file on an existing article = resubmission
  IF NEW.document_url IS NOT NULL
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
$function$;