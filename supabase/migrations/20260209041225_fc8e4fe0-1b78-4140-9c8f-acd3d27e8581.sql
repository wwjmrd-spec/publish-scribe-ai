
-- Create a trigger function to notify admins when a new article is submitted
CREATE OR REPLACE FUNCTION public.notify_admins_on_article_submit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
  v_author_name TEXT;
BEGIN
  -- Get the author name from the article or profile
  v_author_name := COALESCE(NEW.author_name, 'Unknown Author');

  -- Notify all admin users
  FOR admin_record IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      admin_record.user_id,
      'New Article Submitted 📄',
      'A new article "' || NEW.title || '" has been submitted by ' || v_author_name || '. Reference: ' || COALESCE(NEW.reference_number, 'N/A'),
      'info'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger on article insert
CREATE TRIGGER on_article_submitted
  AFTER INSERT ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_article_submit();
