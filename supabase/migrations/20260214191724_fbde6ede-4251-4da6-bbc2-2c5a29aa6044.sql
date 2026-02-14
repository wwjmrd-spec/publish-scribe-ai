
-- Add link column to notifications for clickable navigation
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;
