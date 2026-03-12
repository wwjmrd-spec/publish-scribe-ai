
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS razorpay_subscription_id text,
ADD COLUMN IF NOT EXISTS paypal_subscription_id text;
