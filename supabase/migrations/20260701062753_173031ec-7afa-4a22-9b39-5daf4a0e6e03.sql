ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS review_report_download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_review_report_downloaded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_report_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_report_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS low_score_email_sent_at timestamptz;

ALTER TABLE public.reminder_settings
  ADD COLUMN IF NOT EXISTS max_emails_per_author integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_emails_per_day integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS low_score_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS low_score_from_override text,
  ADD COLUMN IF NOT EXISTS low_score_provider_override text;

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS review_reports_grant integer;
