
-- Allow admins to update any profile (for currency changes, etc.)
CREATE POLICY "Admins can update all profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::user_role));
