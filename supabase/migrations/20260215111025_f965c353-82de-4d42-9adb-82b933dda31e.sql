
-- Update the article submission notification trigger to include link
CREATE OR REPLACE FUNCTION public.notify_admins_on_article_submit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_record RECORD;
  v_author_name TEXT;
BEGIN
  v_author_name := COALESCE(NEW.author_name, 'Unknown Author');

  FOR admin_record IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      admin_record.user_id,
      'New Article Submitted 📄',
      'A new article "' || NEW.title || '" has been submitted by ' || v_author_name || '. Reference: ' || COALESCE(NEW.reference_number, 'N/A'),
      'info',
      '/admin/articles/' || NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Update the referral/status change trigger to include links
CREATE OR REPLACE FUNCTION public.check_referral_reward()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referral RECORD;
  v_current_month TEXT;
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    SELECT r.* INTO v_referral 
    FROM public.referrals r
    WHERE r.referred_id = NEW.author_id 
      AND r.reward_granted = false
    LIMIT 1;
    
    IF FOUND THEN
      v_current_month := TO_CHAR(NOW(), 'YYYY-MM');
      
      INSERT INTO public.plan_usage (user_id, usage_month, review_reports_used, coauthor_certs_used)
      VALUES (v_referral.referrer_id, v_current_month, -2, 0)
      ON CONFLICT (user_id, usage_month)
      DO UPDATE SET review_reports_used = plan_usage.review_reports_used - 2,
                    updated_at = NOW();
      
      UPDATE public.referrals 
      SET reward_granted = true, status = 'rewarded', rewarded_at = NOW()
      WHERE id = v_referral.id;
      
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        v_referral.referrer_id,
        'Referral Reward Earned! 🎉',
        'Your referred author got an article published! You earned 2 bonus review report downloads.',
        'reward',
        '/author/rewards'
      );
      
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        NEW.author_id,
        'Article Published! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published.',
        'success',
        '/author/articles'
      );
    ELSE
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        NEW.author_id,
        'Article Published! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published.',
        'success',
        '/author/articles'
      );
    END IF;
  END IF;
  
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status != 'published' THEN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      NEW.author_id,
      'Article Status Updated',
      'Your article "' || NEW.title || '" status changed to ' || REPLACE(NEW.status::text, '_', ' '),
      'info',
      '/author/articles'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
