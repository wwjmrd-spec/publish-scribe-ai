
CREATE TABLE public.reminder_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frequency_hours integer NOT NULL DEFAULT 24,
  max_days integer NOT NULL DEFAULT 2,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reminder settings" ON public.reminder_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage reminder settings" ON public.reminder_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'::user_role));

INSERT INTO public.reminder_settings (frequency_hours, max_days) VALUES (24, 2);
