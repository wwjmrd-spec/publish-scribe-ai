
CREATE OR REPLACE FUNCTION public.check_referral_reward()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referral RECORD;
  v_referrer_profile RECORD;
  v_referred_profile RECORD;
  v_total_rewarded INTEGER;
  v_discount_amount NUMERIC;
  v_referred_discount NUMERIC;
  v_currency public.discount_currency;
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

      -- Get referrer profile to check if Indian
      SELECT * INTO v_referrer_profile FROM public.profiles WHERE id = v_referral.referrer_id;
      -- Get referred profile to check if Indian
      SELECT * INTO v_referred_profile FROM public.profiles WHERE id = NEW.author_id;

      SELECT COUNT(*) INTO v_total_rewarded
      FROM public.referrals
      WHERE referrer_id = v_referral.referrer_id AND reward_granted = true;

      -- Determine referrer reward based on nationality
      IF v_referrer_profile.is_indian = true THEN
        v_currency := 'INR';
        IF v_total_rewarded = 1 THEN v_discount_amount := 500;
        ELSIF v_total_rewarded = 2 THEN v_discount_amount := 1000;
        ELSIF v_total_rewarded >= 3 THEN v_discount_amount := 1500;
        END IF;
      ELSE
        v_currency := 'USD';
        IF v_total_rewarded = 1 THEN v_discount_amount := 10;
        ELSIF v_total_rewarded = 2 THEN v_discount_amount := 30;
        ELSIF v_total_rewarded >= 3 THEN v_discount_amount := 50;
        END IF;
      END IF;

      -- Generate referrer discount code
      v_referrer_code := 'REF-' || UPPER(SUBSTRING(md5(v_referral.referrer_id::text || NOW()::text || random()::text) FROM 1 FOR 6));
      
      INSERT INTO public.discount_codes (code, discount_type, discount_value, currency, start_date, end_date, is_active, usage_limit, created_by)
      VALUES (
        v_referrer_code, 'fixed', v_discount_amount, v_currency,
        NOW(), NOW() + INTERVAL '1 year', true, 1, v_referral.referrer_id
      );

      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        v_referral.referrer_id,
        'Referral Reward Earned! 🎉',
        CASE WHEN v_currency = 'INR' 
          THEN 'Your referred author got published! You earned a ₹' || v_discount_amount || ' discount code: ' || v_referrer_code
          ELSE 'Your referred author got published! You earned a $' || v_discount_amount || ' discount code: ' || v_referrer_code
        END,
        'reward', '/author/rewards'
      );

      -- Determine referred author reward based on nationality
      IF v_referred_profile.is_indian = true THEN
        v_referred_discount := 500;
        v_referred_code := 'WELCOME-' || UPPER(SUBSTRING(md5(NEW.author_id::text || NOW()::text || random()::text) FROM 1 FOR 6));
        INSERT INTO public.discount_codes (code, discount_type, discount_value, currency, start_date, end_date, is_active, usage_limit, created_by)
        VALUES (v_referred_code, 'fixed', 500, 'INR', NOW(), NOW() + INTERVAL '1 year', true, 1, NEW.author_id);
      ELSE
        v_referred_discount := 10;
        v_referred_code := 'WELCOME-' || UPPER(SUBSTRING(md5(NEW.author_id::text || NOW()::text || random()::text) FROM 1 FOR 6));
        INSERT INTO public.discount_codes (code, discount_type, discount_value, currency, start_date, end_date, is_active, usage_limit, created_by)
        VALUES (v_referred_code, 'fixed', 10, 'USD', NOW(), NOW() + INTERVAL '1 year', true, 1, NEW.author_id);
      END IF;

      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        NEW.author_id,
        'Article Published + Discount! 🎉',
        CASE WHEN v_referred_profile.is_indian = true
          THEN 'Congratulations! Your article "' || NEW.title || '" has been published. You earned a ₹500 discount code: ' || v_referred_code
          ELSE 'Congratulations! Your article "' || NEW.title || '" has been published. You earned a $10 discount code: ' || v_referred_code
        END,
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
