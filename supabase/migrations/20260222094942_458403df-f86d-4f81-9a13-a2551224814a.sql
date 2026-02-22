-- Enable pg_cron and pg_net extensions for scheduled function calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a table to track sent reminders to avoid duplicate emails
CREATE TABLE public.payment_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id),
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reminder_type TEXT NOT NULL DEFAULT 'auto'
);

-- Enable RLS
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage reminders
CREATE POLICY "Admins can manage payment reminders"
ON public.payment_reminders
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::user_role));
