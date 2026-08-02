INSERT INTO public.admin_settings (setting_key, setting_value)
SELECT 'banner_upgrade_pro_enabled', 'false'
WHERE NOT EXISTS (SELECT 1 FROM public.admin_settings WHERE setting_key = 'banner_upgrade_pro_enabled');

INSERT INTO public.admin_settings (setting_key, setting_value)
SELECT 'banner_refer_earn_enabled', 'false'
WHERE NOT EXISTS (SELECT 1 FROM public.admin_settings WHERE setting_key = 'banner_refer_earn_enabled');

CREATE POLICY "Users can view banner toggles"
ON public.admin_settings
FOR SELECT
TO authenticated
USING (setting_key IN ('banner_upgrade_pro_enabled', 'banner_refer_earn_enabled'));