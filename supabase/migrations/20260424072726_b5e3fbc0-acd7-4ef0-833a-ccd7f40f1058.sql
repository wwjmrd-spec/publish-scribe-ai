
-- 1) Replace insecure copyright form storage policies with ownership-scoped ones
DROP POLICY IF EXISTS "Authors can upload copyright forms" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read copyright forms" ON storage.objects;

CREATE POLICY "Authors can upload copyright forms for their articles"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND name LIKE 'copyright-%'
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.author_id = auth.uid()
      AND split_part(name, '-', 2) = a.id::text
  )
);

CREATE POLICY "Authors can read copyright forms for their articles"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND name LIKE 'copyright-%'
  AND (
    has_role(auth.uid(), 'admin'::user_role)
    OR EXISTS (
      SELECT 1 FROM public.articles a
      WHERE a.author_id = auth.uid()
        AND split_part(name, '-', 2) = a.id::text
    )
  )
);

-- 2) Restrict discount code SELECT to authenticated users only
DROP POLICY IF EXISTS "Anyone can view active discount codes" ON public.discount_codes;

CREATE POLICY "Authenticated users can view active discount codes"
ON public.discount_codes FOR SELECT TO authenticated
USING (is_active = true AND now() >= start_date AND now() <= end_date);

-- 3) Plan usage: prevent duplicate rows and allow users to update their own row
-- Deduplicate first, keeping the row with the highest counters
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, usage_month
      ORDER BY (review_reports_used + coauthor_certs_used) DESC, updated_at DESC
    ) AS rn
  FROM public.plan_usage
)
DELETE FROM public.plan_usage
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS plan_usage_user_month_unique
  ON public.plan_usage (user_id, usage_month);

CREATE POLICY "Users can update their own usage"
ON public.plan_usage FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
