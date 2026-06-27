-- Extensions for scheduled polling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =========================
-- ai_emails (inbox cache)
-- =========================
CREATE TABLE public.ai_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_message_id TEXT NOT NULL UNIQUE,
  zoho_thread_id TEXT,
  folder TEXT NOT NULL DEFAULT 'Inbox',
  subject TEXT,
  from_name TEXT,
  from_email TEXT,
  to_email TEXT,
  body_text TEXT,
  body_html TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'new', -- new | drafting | drafted | replied | archived | failed
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_emails TO authenticated;
GRANT ALL ON public.ai_emails TO service_role;
ALTER TABLE public.ai_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ai_emails" ON public.ai_emails
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_ai_emails_received_at ON public.ai_emails (received_at DESC);
CREATE INDEX idx_ai_emails_status ON public.ai_emails (status);
CREATE INDEX idx_ai_emails_thread ON public.ai_emails (zoho_thread_id);

-- =========================
-- ai_draft_replies
-- =========================
CREATE TABLE public.ai_draft_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES public.ai_emails(id) ON DELETE CASCADE,
  subject TEXT,
  body TEXT,
  confidence INTEGER, -- 0..100
  confidence_label TEXT, -- high|medium|low
  category TEXT,
  language TEXT,
  reasoning TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | edited | deleted
  edited_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_draft_replies TO authenticated;
GRANT ALL ON public.ai_draft_replies TO service_role;
ALTER TABLE public.ai_draft_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ai_draft_replies" ON public.ai_draft_replies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_ai_drafts_email ON public.ai_draft_replies (email_id);
CREATE INDEX idx_ai_drafts_status ON public.ai_draft_replies (status);

-- =========================
-- ai_knowledge_base
-- =========================
CREATE TABLE public.ai_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_base TO authenticated;
GRANT ALL ON public.ai_knowledge_base TO service_role;
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage kb" ON public.ai_knowledge_base
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_ai_kb_active ON public.ai_knowledge_base (is_active);

-- =========================
-- ai_faq
-- =========================
CREATE TABLE public.ai_faq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_faq TO authenticated;
GRANT ALL ON public.ai_faq TO service_role;
ALTER TABLE public.ai_faq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage faq" ON public.ai_faq
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================
-- ai_email_settings (single row, key/value-less)
-- =========================
CREATE TABLE public.ai_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  polling_interval_minutes INTEGER NOT NULL DEFAULT 5,
  default_language TEXT NOT NULL DEFAULT 'English',
  reply_tone TEXT NOT NULL DEFAULT 'professional',
  signature TEXT,
  ai_instructions TEXT,
  last_poll_at TIMESTAMPTZ,
  last_poll_status TEXT,
  zoho_account_id TEXT,
  zoho_region TEXT NOT NULL DEFAULT 'com',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_email_settings TO authenticated;
GRANT ALL ON public.ai_email_settings TO service_role;
ALTER TABLE public.ai_email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage settings" ON public.ai_email_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.ai_email_settings (ai_enabled, polling_interval_minutes, default_language, reply_tone, signature, ai_instructions)
VALUES (true, 5, 'English', 'professional',
  E'Best regards,\nWWJMRD Editorial Team',
  'You are an editorial assistant for WWJMRD. Be professional, polite, concise. Use ONLY information from the provided context. Never invent article status, payment status, DOI, certificates, or discounts. If the answer is not in the context, say it requires manual review.'
);

-- =========================
-- ai_email_logs
-- =========================
CREATE TABLE public.ai_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES public.ai_emails(id) ON DELETE SET NULL,
  draft_id UUID REFERENCES public.ai_draft_replies(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- fetch | generate_draft | regenerate | approve | edit | delete | error
  detail JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_email_logs TO authenticated;
GRANT ALL ON public.ai_email_logs TO service_role;
ALTER TABLE public.ai_email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read logs" ON public.ai_email_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_ai_email_logs_email ON public.ai_email_logs (email_id);
CREATE INDEX idx_ai_email_logs_created_at ON public.ai_email_logs (created_at DESC);

-- updated_at triggers
CREATE TRIGGER trg_ai_emails_updated BEFORE UPDATE ON public.ai_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_drafts_updated BEFORE UPDATE ON public.ai_draft_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_kb_updated BEFORE UPDATE ON public.ai_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_faq_updated BEFORE UPDATE ON public.ai_faq
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_settings_updated BEFORE UPDATE ON public.ai_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();