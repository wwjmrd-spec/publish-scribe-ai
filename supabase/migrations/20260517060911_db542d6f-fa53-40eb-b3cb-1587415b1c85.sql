UPDATE public.admin_settings SET setting_value='gemini', updated_at=now() WHERE setting_key='ai_provider';
UPDATE public.admin_settings SET setting_value='gemini-2.0-flash', updated_at=now() WHERE setting_key='ai_model';
UPDATE public.admin_settings SET setting_value='', updated_at=now() WHERE setting_key='ai_api_key';