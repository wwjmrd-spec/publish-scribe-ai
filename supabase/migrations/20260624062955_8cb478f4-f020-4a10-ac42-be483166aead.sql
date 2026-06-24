
ALTER TABLE public.reminder_settings
  ADD COLUMN IF NOT EXISTS urgency_informational_after_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS urgency_moderate_after_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS urgency_high_after_days integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS last_fee_submission_date date;

ALTER TABLE public.payment_reminders
  ADD COLUMN IF NOT EXISTS urgency_level smallint;

CREATE INDEX IF NOT EXISTS payment_reminders_article_urgency_idx
  ON public.payment_reminders (article_id, urgency_level);
