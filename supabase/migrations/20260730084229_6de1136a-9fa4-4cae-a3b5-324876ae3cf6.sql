
-- 1) Article status: enforce allow-list of author-settable statuses on change
CREATE OR REPLACE FUNCTION public.enforce_author_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / system processes
  END IF;
  IF public.has_role(auth.uid(), 'admin'::user_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text NOT IN ('submitted','under_review','revised_submitted','withdrawn') THEN
    RAISE EXCEPTION 'Not allowed to set article status to %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_author_status_transition_trg ON public.articles;
CREATE TRIGGER enforce_author_status_transition_trg
BEFORE UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.enforce_author_status_transition();

-- 2) co_author_certificates: remove client-controlled writes (server/service role only)
DROP POLICY IF EXISTS "Users can insert co-author certificates for their articles" ON public.co_author_certificates;
DROP POLICY IF EXISTS "Users can update co-author certificates for their articles" ON public.co_author_certificates;

CREATE POLICY "Admins can insert co-author certificates"
ON public.co_author_certificates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can update co-author certificates"
ON public.co_author_certificates FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::user_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role));

-- 3) payments: user inserts must be pending, non-negative amounts
DROP POLICY IF EXISTS "Users can insert their own payments" ON public.payments;
CREATE POLICY "Users can insert their own pending payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND COALESCE(payment_status, 'pending'::payment_status) = 'pending'::payment_status
  AND amount >= 0
  AND final_amount >= 0
  AND COALESCE(discount_amount, 0) >= 0
  AND transaction_id IS NULL
);
