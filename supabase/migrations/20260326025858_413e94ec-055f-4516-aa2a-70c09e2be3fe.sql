ALTER TABLE public.articles 
  ADD COLUMN IF NOT EXISTS automation_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manuscript_accepted_email_sent_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fee_reminder_email_sent_at timestamptz DEFAULT NULL;