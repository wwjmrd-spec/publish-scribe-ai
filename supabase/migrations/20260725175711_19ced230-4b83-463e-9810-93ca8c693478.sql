
DROP POLICY IF EXISTS "Authors can upload copyright forms for their articles" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read copyright forms for their articles" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update copyright forms for their articles" ON storage.objects;

CREATE POLICY "Authors can upload copyright forms for their articles"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND name LIKE 'copyright-%'
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.author_id = auth.uid()
      AND storage.objects.name LIKE 'copyright-' || a.id::text || '-%'
  )
);

CREATE POLICY "Authors can update copyright forms for their articles"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'documents'
  AND name LIKE 'copyright-%'
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.author_id = auth.uid()
      AND storage.objects.name LIKE 'copyright-' || a.id::text || '-%'
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND name LIKE 'copyright-%'
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.author_id = auth.uid()
      AND storage.objects.name LIKE 'copyright-' || a.id::text || '-%'
  )
);

CREATE POLICY "Authors can read copyright forms for their articles"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents'
  AND name LIKE 'copyright-%'
  AND (
    public.has_role(auth.uid(), 'admin'::user_role)
    OR EXISTS (
      SELECT 1 FROM public.articles a
      WHERE a.author_id = auth.uid()
        AND storage.objects.name LIKE 'copyright-' || a.id::text || '-%'
    )
  )
);
