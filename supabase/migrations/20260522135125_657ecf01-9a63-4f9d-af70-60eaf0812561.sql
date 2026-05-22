CREATE TABLE IF NOT EXISTS public.publication_form_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL UNIQUE,
  article_title TEXT,
  correspondence_author_name TEXT,
  co_authors_names TEXT,
  country TEXT,
  subject TEXT,
  description TEXT,
  keywords TEXT,
  publication_year_month TEXT,
  doi TEXT,
  abstract TEXT,
  final_pdf_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.publication_form_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage publication form data"
  ON public.publication_form_data FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));

CREATE TRIGGER trg_publication_form_data_updated_at
  BEFORE UPDATE ON public.publication_form_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();