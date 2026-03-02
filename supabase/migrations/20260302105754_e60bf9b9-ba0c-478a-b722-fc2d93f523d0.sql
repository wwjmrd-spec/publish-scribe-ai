-- Add 'USDT' to currency_type enum
ALTER TYPE public.currency_type ADD VALUE IF NOT EXISTS 'USDT';

-- Add 'binance' to payment_gateway enum
ALTER TYPE public.payment_gateway ADD VALUE IF NOT EXISTS 'binance';

-- Add USDT fee columns to publication_fees
ALTER TABLE public.publication_fees
  ADD COLUMN IF NOT EXISTS usdt_fee numeric DEFAULT 79,
  ADD COLUMN IF NOT EXISTS usdt_fast_track_fee numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS usdt_coauthor_fee numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS usdt_pro_fee numeric DEFAULT 19,
  ADD COLUMN IF NOT EXISTS binance_wallet_address text DEFAULT NULL;

-- Add 'USDT' to discount_currency enum
ALTER TYPE public.discount_currency ADD VALUE IF NOT EXISTS 'USDT';