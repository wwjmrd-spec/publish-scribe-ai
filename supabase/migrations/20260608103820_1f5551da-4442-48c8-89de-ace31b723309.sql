
-- 1. Add published_tier column
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS published_tier text
    CHECK (published_tier IN ('free','paid'));

-- Backfill for existing published articles
UPDATE public.articles
SET published_tier = CASE WHEN COALESCE(page_count,0) > 0 AND page_count <= 2 THEN 'free' ELSE 'paid' END
WHERE published_tier IS NULL
  AND status IN ('published','paid');

-- 2. Public read policy for published articles (limited columns enforced in client; RLS allows row visibility)
DROP POLICY IF EXISTS "Anyone can view published articles" ON public.articles;
CREATE POLICY "Anyone can view published articles"
ON public.articles
FOR SELECT
TO anon, authenticated
USING (status = 'published');

GRANT SELECT ON public.articles TO anon;

-- 3. Rewrite referral reward function: percent codes
CREATE OR REPLACE FUNCTION public.check_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_referral RECORD;
  v_referrer_code TEXT;
  v_referred_code TEXT;
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    SELECT r.* INTO v_referral
    FROM public.referrals r
    WHERE r.referred_id = NEW.author_id
      AND r.reward_granted = false
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.referrals
      SET reward_granted = true, status = 'rewarded', rewarded_at = NOW()
      WHERE id = v_referral.id;

      -- Referrer earns a 15% percent code (valid in any currency)
      v_referrer_code := 'REF-' || UPPER(SUBSTRING(md5(v_referral.referrer_id::text || NOW()::text || random()::text) FROM 1 FOR 6));
      INSERT INTO public.discount_codes (code, discount_type, discount_value, currency, start_date, end_date, is_active, usage_limit, created_by)
      VALUES (v_referrer_code, 'percentage', 15, 'BOTH',
              NOW(), NOW() + INTERVAL '1 year', true, 1, v_referral.referrer_id);

      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        v_referral.referrer_id,
        'Referral Reward Earned! 🎉',
        'Your referred author got published! You earned a 15% discount code: ' || v_referrer_code,
        'reward', '/author/rewards'
      );

      -- Referred author gets a 10% welcome code for their next publication
      v_referred_code := 'WELCOME-' || UPPER(SUBSTRING(md5(NEW.author_id::text || NOW()::text || random()::text) FROM 1 FOR 6));
      INSERT INTO public.discount_codes (code, discount_type, discount_value, currency, start_date, end_date, is_active, usage_limit, created_by)
      VALUES (v_referred_code, 'percentage', 10, 'BOTH',
              NOW(), NOW() + INTERVAL '1 year', true, 1, NEW.author_id);

      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        NEW.author_id,
        'Article Published + 10% Off! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published. You earned a 10% discount code for your next publication: ' || v_referred_code,
        'success', '/author/articles'
      );
    ELSE
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        NEW.author_id, 'Article Published! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published.',
        'success', '/author/articles'
      );
    END IF;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status != 'published' THEN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      NEW.author_id, 'Article Status Updated',
      'Your article "' || NEW.title || '" status changed to ' || REPLACE(NEW.status::text, '_', ' '),
      'info', '/author/articles'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Pre-grant welcome 10% code to brand-new authors when they sign up using a referral code
-- (Handled in app code; nothing to change here.)
