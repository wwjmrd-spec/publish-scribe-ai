
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_articles_author_created ON public.articles (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status ON public.articles (status);
CREATE INDEX IF NOT EXISTS idx_articles_auto_status ON public.articles (status, automation_paused, submission_date);
CREATE INDEX IF NOT EXISTS idx_article_reviews_approved ON public.article_reviews (approved, reviewed_at) WHERE report_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_co_authors_article_id ON public.co_authors (article_id);
CREATE INDEX IF NOT EXISTS idx_co_author_certificates_co_author ON public.co_author_certificates (co_author_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_active ON public.user_subscriptions (user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_plan_usage_user ON public.plan_usage (user_id, usage_month);

CREATE POLICY "Admins can insert co_authors"
ON public.co_authors FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can update co_authors"
ON public.co_authors FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::user_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));
