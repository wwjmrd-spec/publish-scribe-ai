
-- Create payment activity tracking table
CREATE TABLE public.payment_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email text,
  user_name text,
  event_type text NOT NULL DEFAULT 'cart_visit',
  product_type text,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  article_title text,
  article_reference text,
  payment_gateway text,
  currency text,
  amount numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_activity ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage payment activity"
  ON public.payment_activity FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::user_role));

-- Users can insert their own activity
CREATE POLICY "Users can insert their own payment activity"
  ON public.payment_activity FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own activity
CREATE POLICY "Users can view their own payment activity"
  ON public.payment_activity FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for faster admin queries
CREATE INDEX idx_payment_activity_created_at ON public.payment_activity(created_at DESC);
CREATE INDEX idx_payment_activity_event_type ON public.payment_activity(event_type);
CREATE INDEX idx_payment_activity_user_id ON public.payment_activity(user_id);
