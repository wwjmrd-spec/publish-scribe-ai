
-- 1. Drop the overly permissive POSITION-based author read on formatted-articles
DROP POLICY IF EXISTS "Authors can read formatted files for their articles" ON storage.objects;

-- 2. Add restrictive deny posture for documents bucket UPDATE/DELETE by non-admins
DROP POLICY IF EXISTS "Only admins can update documents" ON storage.objects;
CREATE POLICY "Only admins can update documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'::public.user_role))
  WITH CHECK (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'::public.user_role));

DROP POLICY IF EXISTS "Only admins can delete documents" ON storage.objects;
CREATE POLICY "Only admins can delete documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'::public.user_role));

-- 3. Allow article authors to read their own publication_form_data
DROP POLICY IF EXISTS "Authors can view their own publication form data" ON public.publication_form_data;
CREATE POLICY "Authors can view their own publication form data"
  ON public.publication_form_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.articles a
      WHERE a.id = publication_form_data.article_id
        AND a.author_id = auth.uid()
    )
  );
