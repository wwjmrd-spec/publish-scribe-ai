
CREATE TABLE IF NOT EXISTS public.chatbot_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  public_key text NOT NULL UNIQUE,
  allowed_origins text[] NOT NULL DEFAULT '{}',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#0066cc',
  welcome_message text NOT NULL DEFAULT 'Hello! How can I help you today?',
  language text NOT NULL DEFAULT 'auto',
  theme text NOT NULL DEFAULT 'light',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chatbot_sites TO anon, authenticated;
GRANT ALL ON public.chatbot_sites TO service_role;
ALTER TABLE public.chatbot_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads active sites" ON public.chatbot_sites
  FOR SELECT USING (is_active = true);
CREATE POLICY "admins manage sites" ON public.chatbot_sites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS chatbot_sites_updated_at ON public.chatbot_sites;
CREATE TRIGGER chatbot_sites_updated_at BEFORE UPDATE ON public.chatbot_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.chatbot_sites (slug, name, public_key, allowed_origins, welcome_message)
VALUES ('wwjmrd-support', 'WWJMRD', 'pk_' || encode(gen_random_bytes(16), 'hex'),
        ARRAY['https://wwjmrd.com','https://wwjmrdai.online','https://www.wwjmrdai.online','https://wwjmrdai.lovable.app'],
        'Hello! How can I help you with your publication today?')
ON CONFLICT (slug) DO NOTHING;
