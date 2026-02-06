
-- Enable pg_net for HTTP requests from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Update the trigger function to also send email notifications
CREATE OR REPLACE FUNCTION public.check_referral_reward()
RETURNS TRIGGER AS $$
DECLARE
  v_referral RECORD;
  v_current_month TEXT;
  v_referrer_profile RECORD;
  v_referred_profile RECORD;
  v_service_role_key TEXT;
  v_supabase_url TEXT;
BEGIN
  -- Only trigger when status changes to 'published'
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    -- Get the referred author's profile
    SELECT * INTO v_referred_profile FROM public.profiles WHERE id = NEW.author_id;
    
    -- Check if the article author was referred by someone
    SELECT r.* INTO v_referral 
    FROM public.referrals r
    WHERE r.referred_id = NEW.author_id 
      AND r.reward_granted = false
    LIMIT 1;
    
    IF FOUND THEN
      -- Get referrer profile
      SELECT * INTO v_referrer_profile FROM public.profiles WHERE id = v_referral.referrer_id;
      
      -- Grant +2 review report downloads to the referrer
      v_current_month := TO_CHAR(NOW(), 'YYYY-MM');
      
      INSERT INTO public.plan_usage (user_id, usage_month, review_reports_used, coauthor_certs_used)
      VALUES (v_referral.referrer_id, v_current_month, -2, 0)
      ON CONFLICT (user_id, usage_month)
      DO UPDATE SET review_reports_used = plan_usage.review_reports_used - 2,
                    updated_at = NOW();
      
      -- Mark referral as rewarded
      UPDATE public.referrals 
      SET reward_granted = true, status = 'rewarded', rewarded_at = NOW()
      WHERE id = v_referral.id;
      
      -- Create in-app notification for the referrer
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        v_referral.referrer_id,
        'Referral Reward Earned! 🎉',
        'Your referred author got an article published! You earned 2 bonus review report downloads.',
        'reward'
      );
      
      -- Create in-app notification for the referred author
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.author_id,
        'Article Published! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published.',
        'success'
      );
      
      -- Send email to referrer
      v_service_role_key := current_setting('app.settings.service_role_key', true);
      v_supabase_url := current_setting('app.settings.supabase_url', true);
      
      IF v_service_role_key IS NOT NULL AND v_supabase_url IS NOT NULL THEN
        PERFORM extensions.http_post(
          url := v_supabase_url || '/functions/v1/send-email',
          body := jsonb_build_object(
            'to', v_referrer_profile.email,
            'template', 'referral-reward',
            'data', jsonb_build_object(
              'referrerName', v_referrer_profile.full_name,
              'referredName', v_referred_profile.full_name,
              'referredEmail', v_referred_profile.email,
              'articleTitle', NEW.title,
              'bonusDownloads', 2,
              'rewardType', 'referrer'
            )
          )::text,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          )
        );
        
        -- Send email to referred author
        PERFORM extensions.http_post(
          url := v_supabase_url || '/functions/v1/send-email',
          body := jsonb_build_object(
            'to', v_referred_profile.email,
            'template', 'referral-reward',
            'data', jsonb_build_object(
              'referrerName', v_referrer_profile.full_name,
              'referredName', v_referred_profile.full_name,
              'articleTitle', NEW.title,
              'bonusDownloads', 2,
              'rewardType', 'referred'
            )
          )::text,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          )
        );
      END IF;
    ELSE
      -- Still notify the author about publication (in-app only)
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.author_id,
        'Article Published! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published.',
        'success'
      );
    END IF;
  END IF;
  
  -- Notify on other status changes (in-app only)
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status != 'published' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.author_id,
      'Article Status Updated',
      'Your article "' || NEW.title || '" status changed to ' || REPLACE(NEW.status::text, '_', ' '),
      'info'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
