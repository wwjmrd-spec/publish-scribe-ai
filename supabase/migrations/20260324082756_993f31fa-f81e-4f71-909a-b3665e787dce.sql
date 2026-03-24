-- Allow authenticated users to upload copyright forms to documents bucket
CREATE POLICY "Authors can upload copyright forms"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents' AND name LIKE 'copyright-%');

-- Allow authenticated users to read their own copyright forms
CREATE POLICY "Authors can read copyright forms"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents' AND name LIKE 'copyright-%');

-- Allow admins to read all documents
CREATE POLICY "Admins can read all documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'::public.user_role));