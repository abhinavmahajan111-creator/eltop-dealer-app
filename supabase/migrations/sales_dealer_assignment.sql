-- sales_dealer_assignment.sql
--
-- Links a dealer (profiles row) to the Sales staff member who owns/onboarded
-- them, and gives Sales staff a safe, read-only way to see their own
-- dealers/parties from the Sales dashboard.
--
-- This is a NEW field, separate from the pre-existing `staff_assigned` text
-- column on profiles (used today by AdminOrders' staff filter). That column
-- is free text typed by Admin with no fixed format, and existing dealers
-- may already have arbitrary values in it — repurposing it risked breaking
-- that filter and misreading old data. `assigned_sales_rep` is new, always
-- either null or an exact staff_profiles.email (enforced by the FK below),
-- and only powers this one feature.
--
-- Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists assigned_sales_rep text references public.staff_profiles(email) on delete set null;

create index if not exists idx_profiles_assigned_sales_rep
  on public.profiles(assigned_sales_rep);

-- get_my_dealers()
--
-- Returns the dealers/parties a Sales staff member is allowed to see,
-- scoped by their tier in the ladder:
--   sales_associate         -> only dealers assigned directly to them
--   senior_sales_associate  -> their own dealers + their direct reports' dealers
--   senior_sales_executive  -> every dealer assigned to anyone in the Sales department
--
-- SECURITY DEFINER, same pattern as claim_staff_profile(): profiles' own RLS
-- only lets a dealer see their own row, so a plain client-side query would
-- return nothing for a staff member. This function runs under its own
-- privileges, looks up the caller's email/role itself via auth.uid(), and
-- returns only the columns the dashboard needs — never the dealer's full
-- profile (no GST, no credit limit, no addresses).
create or replace function public.get_my_dealers()
returns table (
  id          uuid,
  name        text,
  dealer_code text,
  territory   jsonb,
  outstanding numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_role  text;
begin
  select sp.email, sp.role into v_email, v_role
  from public.staff_profiles sp
  where sp.id = v_uid;

  if v_email is null then
    return; -- not a recognized staff member; nothing to return
  end if;

  if v_role = 'sales_associate' then
    return query
      select p.id, p.name, p.dealer_code, to_jsonb(p.territory), p.outstanding
      from public.profiles p
      where p.assigned_sales_rep = v_email
        and p.deleted_at is null
      order by p.name;

  elsif v_role = 'senior_sales_associate' then
    return query
      select p.id, p.name, p.dealer_code, to_jsonb(p.territory), p.outstanding
      from public.profiles p
      where p.deleted_at is null
        and (
          p.assigned_sales_rep = v_email
          or p.assigned_sales_rep in (
            select email from public.staff_profiles where reports_to = v_email
          )
        )
      order by p.name;

  elsif v_role = 'senior_sales_executive' then
    return query
      select p.id, p.name, p.dealer_code, to_jsonb(p.territory), p.outstanding
      from public.profiles p
      where p.deleted_at is null
        and p.assigned_sales_rep in (
          select email from public.staff_profiles where department = 'Sales'
        )
      order by p.name;

  end if;
  -- any other role: falls through, returns no rows
end;
$$;

grant execute on function public.get_my_dealers() to authenticated;
