
-- Allow admins to upload to formatted-articles bucket
CREATE POLICY "Admins can upload formatted articles"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'formatted-articles'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to update files in formatted-articles bucket  
CREATE POLICY "Admins can update formatted articles"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'formatted-articles'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete files in formatted-articles bucket
CREATE POLICY "Admins can delete formatted articles"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'formatted-articles'
  AND public.has_role(auth.uid(), 'admin')
);
