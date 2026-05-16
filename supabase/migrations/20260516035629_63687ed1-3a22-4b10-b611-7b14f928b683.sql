INSERT INTO public.admin_settings (setting_key, setting_value) VALUES
  ('ai_provider', 'gemini'),
  ('ai_api_key', ''),
  ('ai_model', 'gemini-2.0-flash')
ON CONFLICT DO NOTHING;