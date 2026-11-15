REVOKE ALL ON public.disposable_email_domains FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.disposable_email_domains TO authenticated;
GRANT ALL ON public.disposable_email_domains TO service_role;
REVOKE ALL ON public.signup_security_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.signup_security_events TO authenticated;
GRANT ALL ON public.signup_security_events TO service_role;