
-- =========================================================
-- Email Preferences
-- =========================================================
CREATE TABLE public.email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  fee_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  revision_requested_enabled BOOLEAN NOT NULL DEFAULT true,
  marketing_enabled BOOLEAN NOT NULL DEFAULT true,
  announcements_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_preferences TO authenticated;
GRANT ALL ON public.email_preferences TO service_role;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email preferences"
  ON public.email_preferences FOR ALL TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::user_role))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::user_role));

CREATE TRIGGER trg_email_prefs_updated_at
  BEFORE UPDATE ON public.email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_email_prefs_email ON public.email_preferences(email);

-- =========================================================
-- Unsubscribe tokens (secure random, one per author+category)
-- =========================================================
CREATE TABLE public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (author_id, category)
);
GRANT SELECT ON public.email_unsubscribe_tokens TO authenticated;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin view tokens" ON public.email_unsubscribe_tokens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role));
CREATE INDEX idx_unsub_tokens_lookup ON public.email_unsubscribe_tokens(token);

-- =========================================================
-- Audit log
-- =========================================================
CREATE TABLE public.email_preference_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL,
  email TEXT,
  category TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('subscribed', 'unsubscribed')),
  source TEXT NOT NULL DEFAULT 'email_link', -- email_link | dashboard | admin
  actor_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.email_preference_audit TO authenticated;
GRANT ALL ON public.email_preference_audit TO service_role;
ALTER TABLE public.email_preference_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own audit" ON public.email_preference_audit FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::user_role));
CREATE INDEX idx_pref_audit_author ON public.email_preference_audit(author_id, created_at DESC);

-- =========================================================
-- Helper function used by send-* code paths
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_email_category_enabled(_author_id UUID, _category TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  SELECT CASE _category
    WHEN 'fee_reminder' THEN fee_reminder_enabled
    WHEN 'revision_requested' THEN revision_requested_enabled
    WHEN 'marketing' THEN marketing_enabled
    WHEN 'announcements' THEN announcements_enabled
    ELSE true
  END INTO v_enabled
  FROM public.email_preferences
  WHERE author_id = _author_id;
  -- default enabled if no row yet
  RETURN COALESCE(v_enabled, true);
END;
$$;

-- =========================================================
-- Auto-create preferences row on new user
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT;
  v_country TEXT;
  v_affiliation TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_full_name := LEFT(TRIM(regexp_replace(v_full_name, '<[^>]*>', '', 'g')), 100);
  IF v_full_name = '' THEN v_full_name := NEW.email; END IF;

  v_country := COALESCE(NEW.raw_user_meta_data->>'country', 'Unknown');
  v_country := LEFT(TRIM(regexp_replace(v_country, '<[^>]*>', '', 'g')), 100);
  IF v_country = '' THEN v_country := 'Unknown'; END IF;

  v_affiliation := COALESCE(NEW.raw_user_meta_data->>'affiliation', '');
  v_affiliation := LEFT(TRIM(regexp_replace(v_affiliation, '<[^>]*>', '', 'g')), 200);

  INSERT INTO public.profiles (id, email, full_name, country, affiliation, is_indian)
  VALUES (NEW.id, NEW.email, v_full_name, v_country, v_affiliation, LOWER(v_country) = 'india')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'author')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.email_preferences (author_id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (author_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Backfill existing users
INSERT INTO public.email_preferences (author_id, email)
SELECT p.id, p.email FROM public.profiles p
ON CONFLICT (author_id) DO NOTHING;

-- Index for lifetime free download count
CREATE INDEX IF NOT EXISTS idx_rrd_author_type
  ON public.review_report_downloads(author_id, download_type);
