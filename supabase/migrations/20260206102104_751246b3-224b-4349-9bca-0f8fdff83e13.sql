
-- Simplify trigger to only handle in-app notifications (email sending will be handled by client)
CREATE OR REPLACE FUNCTION public.check_referral_reward()
RETURNS TRIGGER AS $$
DECLARE
  v_referral RECORD;
  v_current_month TEXT;
BEGIN
  -- Only trigger when status changes to 'published'
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    -- Check if the article author was referred by someone
    SELECT r.* INTO v_referral 
    FROM public.referrals r
    WHERE r.referred_id = NEW.author_id 
      AND r.reward_granted = false
    LIMIT 1;
    
    IF FOUND THEN
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
    ELSE
      -- Still notify the author about publication (in-app)
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.author_id,
        'Article Published! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published.',
        'success'
      );
    END IF;
  END IF;
  
  -- Notify on other status changes
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
