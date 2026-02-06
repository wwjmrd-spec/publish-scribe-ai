
-- Add referral_code column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Generate referral codes for existing profiles
UPDATE public.profiles SET referral_code = UPPER(SUBSTRING(md5(id::text || created_at::text) FROM 1 FOR 8)) WHERE referral_code IS NULL;

-- Create function to generate referral code on new profile
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := UPPER(SUBSTRING(md5(NEW.id::text || NOW()::text || random()::text) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_referral_code();

-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all notifications"
  ON public.notifications FOR ALL
  USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Referrals table
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES public.profiles(id),
  referred_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  reward_granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rewarded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(referred_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referrals as referrer"
  ON public.referrals FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY "Users can view their own referral as referred"
  ON public.referrals FOR SELECT
  USING (auth.uid() = referred_id);

CREATE POLICY "Users can insert referrals for themselves"
  ON public.referrals FOR INSERT
  WITH CHECK (auth.uid() = referred_id);

CREATE POLICY "Admins can manage all referrals"
  ON public.referrals FOR ALL
  USING (has_role(auth.uid(), 'admin'::user_role));

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create function to grant referral reward when article is published
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
      
      -- Upsert into plan_usage adding bonus reports
      INSERT INTO public.plan_usage (user_id, usage_month, review_reports_used, coauthor_certs_used)
      VALUES (v_referral.referrer_id, v_current_month, -2, 0)
      ON CONFLICT (user_id, usage_month)
      DO UPDATE SET review_reports_used = plan_usage.review_reports_used - 2,
                    updated_at = NOW();
      
      -- Mark referral as rewarded
      UPDATE public.referrals 
      SET reward_granted = true, status = 'rewarded', rewarded_at = NOW()
      WHERE id = v_referral.id;
      
      -- Create notification for the referrer
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        v_referral.referrer_id,
        'Referral Reward Earned! 🎉',
        'Your referred author got an article published! You earned 2 bonus review report downloads.',
        'reward'
      );
      
      -- Create notification for the referred author too
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.author_id,
        'Article Published! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published.',
        'success'
      );
    ELSE
      -- Still notify the author about publication
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.author_id,
        'Article Published! 🎉',
        'Congratulations! Your article "' || NEW.title || '" has been published.',
        'success'
      );
    END IF;
  END IF;
  
  -- Notify on status changes in general
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

CREATE TRIGGER article_status_notification
  AFTER UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_referral_reward();
