
-- Fix 1: Remove public read access to admin_settings
DROP POLICY IF EXISTS "Anyone can view admin settings" ON public.admin_settings;
CREATE POLICY "Only admins can view admin settings" ON public.admin_settings
  FOR SELECT USING (has_role(auth.uid(), 'admin'::user_role));

-- Fix 2: Restrict self-insert on user_roles to author role only
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;
CREATE POLICY "Users can insert their own author role" ON public.user_roles
  FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id AND role = 'author'::user_role);
