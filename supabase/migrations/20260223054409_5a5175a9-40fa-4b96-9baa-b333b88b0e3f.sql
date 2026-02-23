
-- Add publication_type column to articles
ALTER TABLE public.articles 
ADD COLUMN publication_type text NOT NULL DEFAULT 'normal' 
CHECK (publication_type IN ('normal', 'fast_track'));

-- Add fast track fee columns to publication_fees
ALTER TABLE public.publication_fees 
ADD COLUMN indian_fast_track_fee numeric DEFAULT 500,
ADD COLUMN international_fast_track_fee numeric DEFAULT 10;
