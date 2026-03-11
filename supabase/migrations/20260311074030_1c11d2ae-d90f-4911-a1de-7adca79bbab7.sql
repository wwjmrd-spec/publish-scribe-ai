
-- Create admin_settings table to store configurable admin settings
CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage admin settings"
  ON public.admin_settings FOR ALL
  TO public
  USING (public.has_role(auth.uid(), 'admin'::user_role));

-- Anyone can read (needed by edge functions via service role, and for display)
CREATE POLICY "Anyone can view admin settings"
  ON public.admin_settings FOR SELECT
  TO public
  USING (true);

-- Insert default admin notification email
INSERT INTO public.admin_settings (setting_key, setting_value) VALUES
  ('admin_notification_email', 'shubhmeena23@gmail.com');
