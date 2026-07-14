UPDATE public.articles a
SET review_report_url = r.report_url
FROM public.article_reviews r
WHERE r.article_id = a.id
  AND r.approved = true
  AND r.report_url IS NOT NULL
  AND (a.review_report_url IS NULL OR a.review_report_url = '')
  AND r.id = (
    SELECT id FROM public.article_reviews
    WHERE article_id = a.id AND approved = true AND report_url IS NOT NULL
    ORDER BY approved_at DESC NULLS LAST, id DESC
    LIMIT 1
  );