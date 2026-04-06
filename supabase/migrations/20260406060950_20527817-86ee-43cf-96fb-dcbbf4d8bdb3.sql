DROP POLICY IF EXISTS "Only admins can upload formatted articles" ON storage.objects;

CREATE POLICY "Only admins can upload formatted articles"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'formatted-articles'
  AND has_role(auth.uid(), 'admin'::user_role)
);