
-- 1. Remove user self-insert on subscriptions (should only be done server-side after payment)
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.user_subscriptions;

-- 2. Fix formatted-articles storage: restrict uploads to admins only
DROP POLICY IF EXISTS "Service can upload formatted articles" ON storage.objects;
CREATE POLICY "Only admins can upload formatted articles"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'formatted-articles'
    AND public.has_role(auth.uid(), 'admin'::public.user_role)
  );
