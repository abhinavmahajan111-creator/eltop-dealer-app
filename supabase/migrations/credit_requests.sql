-- credit_requests table
-- Tracks dealer self-service requests for payment extensions and temporary
-- credit limit increases. Rows are inserted automatically by the /resolve-order
-- page; status is set synchronously by eligibility logic (no manual admin review
-- step required for the current rules). Admins can UPDATE rows if needed.
--
-- Run in Supabase SQL Editor.

CREATE TABLE public.credit_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type               text        NOT NULL CHECK (type IN ('extra_days', 'extra_limit')),
  status             text        NOT NULL CHECK (status IN ('approved', 'rejected')),
  requested_at       timestamptz NOT NULL DEFAULT now(),
  quarter_key        text        NOT NULL,          -- e.g. '2026-Q3', set by the app
  valid_until        date,                          -- null for rejected rows
  extra_limit_amount numeric,                       -- only set for extra_limit approvals
  notes              text
);

ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;

-- Dealers can insert their own requests (eligibility logic runs in the app)
CREATE POLICY "Dealers can insert their own credit requests"
  ON public.credit_requests FOR INSERT
  WITH CHECK (dealer_id = auth.uid());

-- Dealers can read their own requests (to check active grants)
CREATE POLICY "Dealers can view their own credit requests"
  ON public.credit_requests FOR SELECT
  USING (dealer_id = auth.uid());

-- Admins can see all requests
CREATE POLICY "Admins can view all credit requests"
  ON public.credit_requests FOR SELECT
  USING (public.is_admin());

-- Admins can update any request (manual override, status correction)
CREATE POLICY "Admins can update any credit request"
  ON public.credit_requests FOR UPDATE
  USING (public.is_admin());
