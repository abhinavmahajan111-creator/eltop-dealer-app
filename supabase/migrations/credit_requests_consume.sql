-- credit_requests: add consumed_at + order_id columns, and consume_credit_grant function
-- Run in Supabase SQL Editor after credit_requests.sql has already been applied.

-- Track when and which order consumed a grant (single-use enforcement)
ALTER TABLE public.credit_requests
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_id    uuid REFERENCES public.orders(id);

-- SECURITY DEFINER function so a dealer can mark their own grant consumed without
-- needing a client-facing UPDATE policy on credit_requests.
-- The function enforces: own row, approved status, not already consumed, still valid.
CREATE OR REPLACE FUNCTION public.consume_credit_grant(p_request_id uuid, p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.credit_requests
  SET consumed_at = now(),
      order_id    = p_order_id
  WHERE id           = p_request_id
    AND dealer_id    = auth.uid()
    AND status       = 'approved'
    AND consumed_at  IS NULL
    AND valid_until  >= CURRENT_DATE;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;
