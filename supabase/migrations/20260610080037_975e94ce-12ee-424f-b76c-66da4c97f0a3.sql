
-- Reminder settings: add provider/from override and min/max article age
ALTER TABLE public.reminder_settings
  ADD COLUMN IF NOT EXISTS min_article_age_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_article_age_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS email_provider_override TEXT,
  ADD COLUMN IF NOT EXISTS email_from_override TEXT;

-- Backfill max_article_age_days from existing max_days where it was set very low
UPDATE public.reminder_settings
SET max_article_age_days = GREATEST(max_article_age_days, 30)
WHERE max_article_age_days < 30;

-- Email template overrides
CREATE TABLE IF NOT EXISTS public.email_templates (
  template_key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage email templates"
  ON public.email_templates
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
