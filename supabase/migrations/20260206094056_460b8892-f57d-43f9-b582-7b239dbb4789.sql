
-- Add pro plan fee columns to publication_fees
ALTER TABLE public.publication_fees
ADD COLUMN IF NOT EXISTS indian_pro_fee numeric DEFAULT 999,
ADD COLUMN IF NOT EXISTS international_pro_fee numeric DEFAULT 19;

-- Create user_subscriptions table
CREATE TABLE public.user_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'pro')),
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  payment_id UUID REFERENCES public.payments(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index for active subscriptions per user
CREATE UNIQUE INDEX idx_active_subscription ON public.user_subscriptions (user_id) WHERE (is_active = true);

-- Enable RLS
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON public.user_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
ON public.user_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all subscriptions"
ON public.user_subscriptions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can manage all subscriptions"
ON public.user_subscriptions
FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));

-- Create plan_usage table to track monthly usage
CREATE TABLE public.plan_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  usage_month TEXT NOT NULL, -- Format: YYYY-MM
  review_reports_used INTEGER NOT NULL DEFAULT 0,
  coauthor_certs_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, usage_month)
);

-- Enable RLS
ALTER TABLE public.plan_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for plan_usage
CREATE POLICY "Users can view their own usage"
ON public.plan_usage
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage"
ON public.plan_usage
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage"
ON public.plan_usage
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all usage"
ON public.plan_usage
FOR SELECT
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can manage all usage"
ON public.plan_usage
FOR ALL
USING (has_role(auth.uid(), 'admin'::user_role));
