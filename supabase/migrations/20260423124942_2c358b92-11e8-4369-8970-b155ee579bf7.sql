DROP POLICY IF EXISTS "Service can insert email logs" ON public.email_log;

CREATE POLICY "Admins can insert email logs"
  ON public.email_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));