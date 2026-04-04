
-- 1. Fix reminder_settings: Replace public SELECT with admin-only SELECT
DROP POLICY IF EXISTS "Anyone can view reminder settings" ON public.reminder_settings;
CREATE POLICY "Only admins can view reminder settings"
  ON public.reminder_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role));

-- 2. Fix publication_fees: Replace public SELECT with authenticated-only SELECT
DROP POLICY IF EXISTS "Anyone can view publication fees" ON public.publication_fees;
CREATE POLICY "Authenticated users can view publication fees"
  ON public.publication_fees FOR SELECT
  TO authenticated
  USING (true);

-- 3. Fix user_roles: Replace ALL policy with specific policies that have proper WITH CHECK
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can select all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role));
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role));
