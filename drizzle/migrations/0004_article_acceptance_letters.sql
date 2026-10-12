CREATE TABLE public.article_acceptance_letters (
 article_id uuid PRIMARY KEY REFERENCES public.articles(id) ON DELETE CASCADE,
 letter_number text NOT NULL,
 acceptance_date date NOT NULL,
 file_path text NOT NULL,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.article_acceptance_letters TO authenticated;
GRANT ALL ON public.article_acceptance_letters TO service_role;
ALTER TABLE public.article_acceptance_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners and admins can read acceptance letters" ON public.article_acceptance_letters FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = article_id AND a.author_id = auth.uid()));