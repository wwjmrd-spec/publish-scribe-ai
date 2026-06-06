
CREATE TABLE public.scheduled_broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  recipients JSONB NOT NULL,
  send_email BOOLEAN NOT NULL DEFAULT false,
  email_provider_override TEXT,
  email_from TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notifications_sent INTEGER,
  emails_sent INTEGER,
  emails_failed INTEGER,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_broadcasts TO authenticated;
GRANT ALL ON public.scheduled_broadcasts TO service_role;

ALTER TABLE public.scheduled_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage scheduled broadcasts"
  ON public.scheduled_broadcasts
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));

CREATE INDEX scheduled_broadcasts_due_idx
  ON public.scheduled_broadcasts (scheduled_for)
  WHERE status = 'pending';

CREATE TRIGGER update_scheduled_broadcasts_updated_at
  BEFORE UPDATE ON public.scheduled_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
