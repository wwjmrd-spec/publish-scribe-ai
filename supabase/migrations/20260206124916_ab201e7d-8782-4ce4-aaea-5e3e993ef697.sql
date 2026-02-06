-- Add payment_items JSONB column to store mixed cart item types
-- This supports unified cart payments for articles, pro subscriptions, and co-author certificates
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_items jsonb DEFAULT '[]'::jsonb;