
-- Re-grant table-level privileges. Row-level security policies still enforce row visibility.

-- Authenticated user-facing tables (RLS scopes rows)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.co_authors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_writer_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bug_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.co_author_certificates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_redemptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publication_fees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publication_form_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_broadcasts TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.admin_settings TO authenticated;

-- Anon: only public-facing endpoints + signup-time inserts
GRANT INSERT ON public.contact_questions TO anon;
GRANT INSERT ON public.bug_reports TO anon;

-- Public views
GRANT SELECT ON public.published_articles_public TO anon, authenticated;
GRANT SELECT ON public.co_authors_public TO anon, authenticated;
GRANT SELECT ON public.publication_fees_public TO anon, authenticated;

-- Service role full access on everything (edge functions)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Also ensure authenticated can use sequences for inserts
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
