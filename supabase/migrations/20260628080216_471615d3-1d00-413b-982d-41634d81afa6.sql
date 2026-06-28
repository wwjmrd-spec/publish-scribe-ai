ALTER TABLE public.ai_email_settings
  ADD COLUMN IF NOT EXISTS zoho_client_id text,
  ADD COLUMN IF NOT EXISTS zoho_client_secret text,
  ADD COLUMN IF NOT EXISTS zoho_refresh_token text;