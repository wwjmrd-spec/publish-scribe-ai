-- Create storage buckets for documents and certificates
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('review-reports', 'review-reports', false);

-- Storage policies for documents bucket
CREATE POLICY "Users can upload their own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'));

-- Storage policies for certificates bucket
CREATE POLICY "Users can view their own certificates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can upload certificates"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all certificates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'));

-- Storage policies for review-reports bucket
CREATE POLICY "Users can view their own review reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can upload review reports"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-reports' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all review reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-reports' AND public.has_role(auth.uid(), 'admin'));