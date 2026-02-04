-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (id, email, full_name, country, affiliation, is_indian)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'country', 'Unknown'),
    COALESCE(NEW.raw_user_meta_data->>'affiliation', ''),
    LOWER(COALESCE(NEW.raw_user_meta_data->>'country', '')) = 'india'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert into user_roles (default to author)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'author')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add unique constraint on user_roles.user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_key'
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Fix existing user by inserting their data
INSERT INTO public.profiles (id, email, full_name, country, affiliation, is_indian)
VALUES (
  '2a560319-6c66-43d7-a1e2-42442035a2b7',
  'shubhmeena23@gmail.com',
  'Shubham Meena',
  'India',
  'prof',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('2a560319-6c66-43d7-a1e2-42442035a2b7', 'author')
ON CONFLICT (user_id) DO NOTHING;