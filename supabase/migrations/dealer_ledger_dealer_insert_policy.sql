-- dealer_ledger: dealer INSERT policy (order-type entries only)
--
-- Context: dealer_ledger was created directly in Supabase SQL Editor and is not
-- tracked in schema.sql. This migration records the RLS addition made on 2026-08-11.
--
-- Allows a dealer to insert their own order-type ledger entry (written by
-- AppContext.placeOrder after a successful /cart order). Scoped strictly to
-- type = 'order' so dealers cannot insert type = 'payment', 'credit_note',
-- 'journal', or 'payment_out' — any entry that would reduce their own balance
-- remains admin/service-role only.
--
-- Run in Supabase SQL Editor.

CREATE POLICY "Dealers can insert their own order ledger entries"
  ON public.dealer_ledger FOR INSERT
  WITH CHECK (dealer_id = auth.uid() AND type = 'order');
