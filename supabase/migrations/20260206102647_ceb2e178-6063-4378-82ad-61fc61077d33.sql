-- Add published_link column to articles table
ALTER TABLE public.articles
ADD COLUMN published_link TEXT NULL;