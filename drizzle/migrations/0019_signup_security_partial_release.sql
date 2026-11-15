CREATE TABLE public.disposable_email_domains (
 domain text PRIMARY KEY,
 source text NOT NULL DEFAULT 'disposable-email-domains/disposable-email-domains',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT disposable_domain_normalized CHECK (domain = lower(btrim(domain)) AND domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$')
);
GRANT SELECT ON public.disposable_email_domains TO authenticated;
GRANT ALL ON public.disposable_email_domains TO service_role;
ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read disposable domains" ON public.disposable_email_domains FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.signup_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_type text NOT NULL,
 provider text NOT NULL DEFAULT 'email',
 email_domain text,
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT signup_event_type CHECK (event_type IN ('registration_attempt','captcha_success','captcha_failure','disposable_rejection','registration_submitted','registration_rejected','suspicious_activity','guard_failure')),
 CONSTRAINT signup_event_provider CHECK (provider IN ('email','google')),
 CONSTRAINT signup_event_reason CHECK (reason IS NULL OR length(reason) <= 80),
 CONSTRAINT signup_event_domain CHECK (email_domain IS NULL OR length(email_domain) <= 253)
);
GRANT SELECT ON public.signup_security_events TO authenticated;
GRANT ALL ON public.signup_security_events TO service_role;
ALTER TABLE public.signup_security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read signup events" ON public.signup_security_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX signup_security_events_created_at_idx ON public.signup_security_events(created_at DESC);
COMMENT ON TABLE public.signup_security_events IS 'Partial-release guarded email registration only. No raw emails, credentials, tokens or IP addresses. Direct managed Auth endpoints and OAuth are not guarded by this table.';