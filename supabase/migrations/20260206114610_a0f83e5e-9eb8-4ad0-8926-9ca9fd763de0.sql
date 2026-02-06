
-- Add new fields to articles table
ALTER TABLE public.articles
ADD COLUMN author_name TEXT,
ADD COLUMN country TEXT,
ADD COLUMN subject TEXT,
ADD COLUMN reason_of_research TEXT,
ADD COLUMN submission_target TEXT;
