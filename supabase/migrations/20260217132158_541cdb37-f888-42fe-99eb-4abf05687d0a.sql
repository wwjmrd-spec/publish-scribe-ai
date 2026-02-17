
-- Update handle_new_user to sanitize user-supplied metadata inputs
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT;
  v_country TEXT;
  v_affiliation TEXT;
BEGIN
  -- Sanitize full_name: limit to 100 chars, strip HTML-like tags
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_full_name := LEFT(TRIM(regexp_replace(v_full_name, '<[^>]*>', '', 'g')), 100);
  IF v_full_name = '' THEN
    v_full_name := NEW.email;
  END IF;

  -- Sanitize country: limit to 100 chars, strip HTML-like tags
  v_country := COALESCE(NEW.raw_user_meta_data->>'country', 'Unknown');
  v_country := LEFT(TRIM(regexp_replace(v_country, '<[^>]*>', '', 'g')), 100);
  IF v_country = '' THEN
    v_country := 'Unknown';
  END IF;

  -- Sanitize affiliation: limit to 200 chars, strip HTML-like tags
  v_affiliation := COALESCE(NEW.raw_user_meta_data->>'affiliation', '');
  v_affiliation := LEFT(TRIM(regexp_replace(v_affiliation, '<[^>]*>', '', 'g')), 200);

  -- Insert into profiles
  INSERT INTO public.profiles (id, email, full_name, country, affiliation, is_indian)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_country,
    v_affiliation,
    LOWER(v_country) = 'india'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert into user_roles (default to author)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'author')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
