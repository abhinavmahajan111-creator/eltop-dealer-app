-- Add per-stage delivery timestamp columns to orders.
-- Safe/additive — IF NOT EXISTS means safe to re-run on a live DB.
-- Run in Supabase SQL Editor.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at       timestamptz,
  ADD COLUMN IF NOT EXISTS out_for_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at        timestamptz;
