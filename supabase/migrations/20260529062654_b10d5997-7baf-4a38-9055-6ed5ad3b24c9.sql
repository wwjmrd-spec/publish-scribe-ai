
-- Track which articles were created via the AI Article Writer
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_articles_created_via ON public.articles(created_via);

-- AI Article Writer usage log
CREATE TABLE IF NOT EXISTS public.ai_writer_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  user_name text,
  action text NOT NULL,           -- 'generate' | 'polish' | 'correct' | 'submit'
  article_title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_writer_usage TO authenticated;
GRANT ALL ON public.ai_writer_usage TO service_role;

ALTER TABLE public.ai_writer_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own ai writer usage"
  ON public.ai_writer_usage FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own ai writer usage"
  ON public.ai_writer_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all ai writer usage"
  ON public.ai_writer_usage FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can manage ai writer usage"
  ON public.ai_writer_usage FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));

CREATE INDEX IF NOT EXISTS idx_ai_writer_usage_user_id ON public.ai_writer_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_writer_usage_created_at ON public.ai_writer_usage(created_at DESC);
