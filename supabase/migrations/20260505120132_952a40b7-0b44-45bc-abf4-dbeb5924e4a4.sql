ALTER TABLE public.referrals
ADD COLUMN IF NOT EXISTS referral_email_sent_at timestamp with time zone;