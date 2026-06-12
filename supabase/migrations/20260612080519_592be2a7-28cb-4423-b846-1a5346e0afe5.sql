
-- 1) Allow anonymous visitors to read published articles via PostgREST.
GRANT SELECT ON public.articles TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO anon;

-- 2) Admin-managed display order for publications.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS display_order integer;
CREATE INDEX IF NOT EXISTS idx_articles_display_order
  ON public.articles(display_order) WHERE display_order IS NOT NULL;

-- 3) Contact Us submissions.
CREATE TABLE IF NOT EXISTS public.contact_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  phone text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  ip_address text,
  user_agent text,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contact_questions TO anon;
GRANT INSERT ON public.contact_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_questions TO authenticated;
GRANT ALL ON public.contact_questions TO service_role;

ALTER TABLE public.contact_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a contact question"
  ON public.contact_questions FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view contact questions"
  ON public.contact_questions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.user_role));

CREATE POLICY "Admins can update contact questions"
  ON public.contact_questions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.user_role));

CREATE POLICY "Admins can delete contact questions"
  ON public.contact_questions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.user_role));

CREATE TRIGGER update_contact_questions_updated_at
  BEFORE UPDATE ON public.contact_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Notify admins on new contact submission.
CREATE OR REPLACE FUNCTION public.notify_admins_on_contact_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      admin_record.user_id,
      'New Contact Message 💬',
      NEW.name || ' (' || NEW.email || '): ' || NEW.subject,
      'info',
      '/admin/questions'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_admins_on_contact_question_trigger
  AFTER INSERT ON public.contact_questions
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_contact_question();
