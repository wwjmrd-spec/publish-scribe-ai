-- Add email format validation constraint to co_authors table
ALTER TABLE public.co_authors 
ADD CONSTRAINT email_format_check 
CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(email) <= 254);

-- Add name length constraint
ALTER TABLE public.co_authors 
ADD CONSTRAINT name_length_check 
CHECK (length(name) > 0 AND length(name) <= 200);

-- Add affiliation length constraint
ALTER TABLE public.co_authors 
ADD CONSTRAINT affiliation_length_check 
CHECK (affiliation IS NULL OR length(affiliation) <= 500);