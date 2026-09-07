ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text, ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.co_authors ADD COLUMN IF NOT EXISTS first_name text, ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.profiles
SET first_name = COALESCE(first_name, NULLIF(split_part(btrim(full_name), ' ', 1), '')),
    last_name = COALESCE(last_name, NULLIF(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), ''))
WHERE full_name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);

UPDATE public.co_authors
SET first_name = COALESCE(first_name, NULLIF(split_part(btrim(name), ' ', 1), '')),
    last_name = COALESCE(last_name, NULLIF(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), ''))
WHERE name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);