-- admin_visit_controls.sql
--
-- Gives admins visibility and a manual override for the field check-in/
-- check-out workflow (supabase/migrations/sales_visits_checkinout.sql),
-- for cases discussed 3 Sept 2026: a rep's phone dies right after check-in
-- (before checkout), or a dealer's saved GPS location is wrong/stale and
-- keeps failing the 100m geofence — in both cases the rep is stuck with an
-- open visit and, before this, NO one (not even an admin) had any way to
-- close it, because sales_visits has RLS enabled with zero policies —
-- every read/write goes through SECURITY DEFINER functions, and until now
-- none of them were admin-facing.
--
-- Three additions:
--   1. Two audit columns on sales_visits, so a force-closed visit is
--      visibly distinguishable from a normal checkout, not silently
--      indistinguishable from real field data.
--   2. admin_get_all_visits() — the "activity log": every check-in/
--      check-out, across every rep and dealer, admin-only.
--   3. admin_force_checkout() — the emergency override: closes a stuck
--      open visit WITHOUT the 100m geofence or photo/video requirements
--      (an admin isn't standing at the dealer), but requires a reason and
--      records exactly who force-closed it and why.
--
-- Resetting a dealer's bad/stale GPS location does NOT need a new
-- function: public.profiles already has an admin-write RLS policy
-- ("Admins can update any profile", supabase/schema.sql) that lets an
-- admin clear location_lat/location_lng directly from the client — the
-- next check-in there re-sets it fresh, same as a brand-new dealer (see
-- start_dealer_visit's "first-ever check-in sets its location").
--
-- Run in Supabase SQL Editor.

-- ── 1. Audit columns — who force-closed a visit, and why ────────────────

alter table public.sales_visits
  add column if not exists forced_checkout boolean not null default false,
  add column if not exists force_checkout_by text,
  add column if not exists force_checkout_reason text;

-- ── 2. admin_get_all_visits() — full check-in/check-out activity log ───

create or replace function public.admin_get_all_visits(
  p_limit  int  default 200,
  p_status text default null,   -- null = both, 'open', 'checked_out'
  p_search text default null    -- matches dealer name/code or staff name/email
)
returns table (
  id                    uuid,
  dealer_id             uuid,
  dealer_name           text,
  dealer_code           text,
  staff_email           text,
  staff_name            text,
  status                text,
  check_in_at           timestamptz,
  check_in_lat          numeric,
  check_in_lng          numeric,
  check_out_at          timestamptz,
  check_out_lat         numeric,
  check_out_lng         numeric,
  notes                 text,
  forced_checkout       boolean,
  force_checkout_by     text,
  force_checkout_reason text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return;
  end if;

  return query
    select
      sv.id, sv.dealer_id, p.name, p.dealer_code,
      sv.staff_email, sp.name,
      sv.status, sv.check_in_at, sv.check_in_lat, sv.check_in_lng,
      sv.check_out_at, sv.check_out_lat, sv.check_out_lng,
      sv.notes, sv.forced_checkout, sv.force_checkout_by, sv.force_checkout_reason
    from public.sales_visits sv
    left join public.profiles p on p.id = sv.dealer_id
    left join public.staff_profiles sp on sp.email = sv.staff_email
    where (p_status is null or sv.status = p_status)
      and (
        p_search is null or length(trim(p_search)) = 0
        or p.name ilike '%' || trim(p_search) || '%'
        or p.dealer_code ilike '%' || trim(p_search) || '%'
        or sp.name ilike '%' || trim(p_search) || '%'
        or sv.staff_email ilike '%' || trim(p_search) || '%'
      )
    order by coalesce(sv.check_in_at, sv.visited_at) desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.admin_get_all_visits(int, text, text) to authenticated;

-- ── 3. admin_force_checkout() — the emergency override ──────────────────

create or replace function public.admin_force_checkout(p_visit_id uuid, p_reason text)
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
begin
  if not public.is_admin() then
    return query select false, 'not authorized'::text;
    return;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    return query select false, 'a reason is required to force checkout'::text;
    return;
  end if;

  select a.email into v_admin_email from public.admins a where a.id = auth.uid();

  if not exists (select 1 from public.sales_visits sv where sv.id = p_visit_id and sv.status = 'open') then
    return query select false, 'no matching open visit found'::text;
    return;
  end if;

  update public.sales_visits
  set status = 'checked_out',
      check_out_at = now(),
      forced_checkout = true,
      force_checkout_by = coalesce(v_admin_email, 'admin'),
      force_checkout_reason = trim(p_reason)
  where id = p_visit_id;

  return query select true, 'checked out'::text;
end;
$$;

grant execute on function public.admin_force_checkout(uuid, text) to authenticated;
