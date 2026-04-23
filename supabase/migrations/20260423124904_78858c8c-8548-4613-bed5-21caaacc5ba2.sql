-- ============================================================
-- WAVE 1: Article statuses (extended enum + manual setting)
-- ============================================================
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'copyright_received';
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'ai_review_generated';
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'revision_requested';
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'revised_submitted';
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'revised_review_generated';
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'galley_proof_sent';
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'galley_proof_approved';
ALTER TYPE public.article_status ADD VALUE IF NOT EXISTS 'galley_proof_revised';

-- ============================================================
-- WAVE 2: Email Sent log (admin tracks all outbound emails)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  template_name text,
  email_type text NOT NULL DEFAULT 'transactional',
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  related_article_id uuid,
  related_user_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_sent_at ON public.email_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON public.email_log(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_log_related_article ON public.email_log(related_article_id);
CREATE INDEX IF NOT EXISTS idx_email_log_template ON public.email_log(template_name);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all email logs"
  ON public.email_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage email logs"
  ON public.email_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Edge functions (service role) bypass RLS, so no insert policy needed for them
-- but allow authenticated server-side inserts for safety
CREATE POLICY "Service can insert email logs"
  ON public.email_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- WAVE 4: Discount codes — applies_to, position, specific articles, per-user limit
-- ============================================================
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS article_position_limit text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS specific_article_ids uuid[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_uses_per_user integer DEFAULT NULL;

-- applies_to: 'article_fee' | 'pro_plan' | 'both'
-- article_position_limit: 'any' | 'first' | 'first_two'

-- Track per-user redemptions
CREATE TABLE IF NOT EXISTS public.discount_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  payment_id uuid,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_redemptions_user ON public.discount_redemptions(user_id, discount_code_id);

ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all redemptions"
  ON public.discount_redemptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own redemptions"
  ON public.discount_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own redemptions"
  ON public.discount_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage redemptions"
  ON public.discount_redemptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));