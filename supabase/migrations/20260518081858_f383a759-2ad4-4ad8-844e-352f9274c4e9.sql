ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS in_publish_queue boolean NOT NULL DEFAULT false;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS publish_queue_added_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS idx_articles_publish_queue ON public.articles(in_publish_queue) WHERE in_publish_queue = true;