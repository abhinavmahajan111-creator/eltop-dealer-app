-- sales_profiles_location_columns_fix.sql
--
-- Fixes a live bug: checking in at a shop was failing with
-- "column p.location_lat does not exist" — start_dealer_visit() (and the
-- first-check-in-sets-location fallback) has always assumed profiles has
-- location_lat/location_lng columns, but they were never actually added
-- to the table by any prior migration. This adds them.
--
-- Safe to run any time — IF NOT EXISTS makes it a no-op if they're
-- somehow already there.
--
-- Run in Supabase SQL Editor.

alter table public.profiles add column if not exists location_lat double precision;
alter table public.profiles add column if not exists location_lng double precision;
