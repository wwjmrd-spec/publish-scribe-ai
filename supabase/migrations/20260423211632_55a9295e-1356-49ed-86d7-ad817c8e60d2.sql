CREATE POLICY "Authors can upload galley proof revisions"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'formatted-articles'
  AND (storage.foldername(name))[1] = 'galley-proofs'
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.id::text = (storage.foldername(name))[2]
      AND a.author_id = auth.uid()
  )
);

CREATE POLICY "Authors can read galley proof files for their articles"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'formatted-articles'
  AND (storage.foldername(name))[1] = 'galley-proofs'
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.id::text = (storage.foldername(name))[2]
      AND a.author_id = auth.uid()
  )
);
