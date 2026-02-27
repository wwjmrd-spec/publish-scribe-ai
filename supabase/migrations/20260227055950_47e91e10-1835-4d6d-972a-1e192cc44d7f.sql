
-- Storage policy for service role uploads (without TO clause)
CREATE POLICY "Service can upload formatted articles" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'formatted-articles');
