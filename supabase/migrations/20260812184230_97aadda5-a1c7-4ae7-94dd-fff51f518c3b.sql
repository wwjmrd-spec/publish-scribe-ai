ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS fee_promise_date date,
  ADD COLUMN IF NOT EXISTS fee_promise_status text NOT NULL DEFAULT 'unasked';