DO $$
DECLARE
  r RECORD;
  marker CONSTANT text := '<div style="background:#0f172a;color:#fff;text-align:center;padding:12px;margin-top:14px;';
  blk text;
  authors text;
  yr text;
BEGIN
  FOR r IN
    SELECT a.id, a.author_name, a.created_at
    FROM public.articles a
    WHERE (a.formatted_content IS NOT NULL OR a.author_revision_html IS NOT NULL)
  LOOP
    SELECT COALESCE(NULLIF(r.author_name,''),'Author') ||
           COALESCE((SELECT ', ' || string_agg(c.name, ', ' ORDER BY c.created_at)
                     FROM public.co_authors c WHERE c.article_id = r.id AND COALESCE(c.name,'') <> ''), '')
      INTO authors;
    yr := to_char(now(), 'YYYY');
    blk := '<div class="ww-cc-license" style="margin-top:8px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:4px;padding:8px 12px;display:flex;align-items:flex-start;gap:10px;">'
        || '<a href="https://creativecommons.org/licenses/by/4.0/" style="flex:0 0 auto;"><img src="https://licensebuttons.net/l/by/4.0/88x31.png" alt="Creative Commons Attribution 4.0 International License" style="width:88px;height:31px;display:block;" /></a>'
        || '<p style="font-size:8.5px;line-height:1.5;margin:0;color:#334155;text-align:justify;font-family:Arial,sans-serif;"><strong>Copyright:</strong> &copy; ' || yr || ' ' || authors
        || '. Published by WWJMRD. This is an open-access article distributed under the terms of the Creative Commons Attribution 4.0 International License (CC BY 4.0) (https://creativecommons.org/licenses/by/4.0/), which permits unrestricted use, distribution, and reproduction in any medium, provided the original author and source are properly credited.</p></div>';

    UPDATE public.articles SET
      formatted_content = CASE
        WHEN formatted_content IS NOT NULL
         AND position('ww-cc-license' in formatted_content) = 0
         AND position(marker in formatted_content) > 0
        THEN replace(formatted_content, marker, blk || marker)
        ELSE formatted_content END,
      author_revision_html = CASE
        WHEN author_revision_html IS NOT NULL
         AND position('ww-cc-license' in author_revision_html) = 0
         AND position(marker in author_revision_html) > 0
        THEN replace(author_revision_html, marker, blk || marker)
        ELSE author_revision_html END
    WHERE id = r.id;
  END LOOP;
END $$;