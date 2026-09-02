-- sales_visits.sql
--
-- Visit logging + GPS check-in for Sales staff: a rep can log a visit to
-- one of their assigned dealers with notes and their current GPS
-- location, and see their own visit history plus each dealer's.
--
-- Everything goes through SECURITY DEFINER RPCs (insert included), same
-- as every other Sales-dashboard function this build — no direct client
-- policies on the table itself, so there's nothing here that can hit the
-- kind of unexplained RLS mismatch the staff-login work ran into earlier.
-- The table has RLS enabled with no permissive policies: the only way in
-- or out is through these functions, which do their own scope checks.
--
-- Run in Supabase SQL Editor.

create table if not exists public.sales_visits (
  id          uuid primary key default gen_random_uuid(),
  dealer_id   uuid not null references public.profiles(id) on delete cascade,
  staff_email text not null references public.staff_profiles(email) on delete cascade,
  notes       text,
  latitude    numeric,
  longitude   numeric,
  visited_at  timestamptz not null default now()
);

create index if not exists idx_sales_visits_dealer_id on public.sales_visits(dealer_id);
create index if not exists idx_sales_visits_staff_email on public.sales_visits(staff_email);

alter table public.sales_visits enable row level security;
-- No policies added — every read/write goes through the SECURITY DEFINER
-- functions below, which run under their own privileges regardless.

-- log_dealer_visit(): records a visit to one of the caller's own
-- assigned dealers. Re-checks the same role-based scope as
-- get_dealer_detail()/get_dealer_orders() before inserting, so a rep
-- can't log a visit against a dealer outside their list.
create or replace function public.log_dealer_visit(
  p_dealer_id uuid,
  p_notes text default null,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns table (success boolean, message text, visit_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_role  text;
  v_allowed boolean := false;
  v_visit_id uuid;
begin
  select sp.email, sp.role into v_email, v_role
  from public.staff_profiles sp
  where sp.id = v_uid;

  if v_email is null then
    return query select false, 'not authenticated as staff'::text, null::uuid;
    return;
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = p_dealer_id
      and p.deleted_at is null
      and (
        (v_role = 'sales_associate' and p.assigned_sales_rep = v_email)
        or (v_role = 'senior_sales_associate' and (
              p.assigned_sales_rep = v_email
              or p.assigned_sales_rep in (
                select sp2.email from public.staff_profiles sp2 where sp2.reports_to = v_email
              )
            ))
        or (v_role = 'senior_sales_executive' and p.assigned_sales_rep in (
              select sp3.email from public.staff_profiles sp3 where sp3.department = 'Sales'
            ))
      )
  ) into v_allowed;

  if not v_allowed then
    return query select false, 'dealer not in your assigned list'::text, null::uuid;
    return;
  end if;

  insert into public.sales_visits (dealer_id, staff_email, notes, latitude, longitude)
  values (p_dealer_id, v_email, nullif(trim(p_notes), ''), p_latitude, p_longitude)
  returning id into v_visit_id;

  return query select true, 'ok'::text, v_visit_id;
end;
$$;

grant execute on function public.log_dealer_visit(uuid, text, numeric, numeric) to authenticated;

-- get_my_visits(): the caller's own recent visits, across all their
-- dealers, newest first — powers the "My Visits" card on the dashboard.
create or replace function public.get_my_visits(p_limit int default 20)
returns table (
  id         uuid,
  dealer_id  uuid,
  dealer_name text,
  notes      text,
  latitude   numeric,
  longitude  numeric,
  visited_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  select sp.email into v_email
  from public.staff_profiles sp
  where sp.id = v_uid;

  if v_email is null then
    return;
  end if;

  return query
    select
      sv.id,
      sv.dealer_id,
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name) as dealer_name,
      sv.notes,
      sv.latitude,
      sv.longitude,
      sv.visited_at
    from public.sales_visits sv
    join public.profiles p on p.id = sv.dealer_id
    where sv.staff_email = v_email
    order by sv.visited_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_my_visits(int) to authenticated;

-- get_dealer_visits(): visit history for one dealer — powers a "Recent
-- Visits" section on the dealer detail screen. Same scope check as
-- get_dealer_orders(), and also shows visits logged by teammates (e.g. a
-- Senior Sales Associate sees their own reports' visits to a shared
-- dealer), not just the caller's own.
create or replace function public.get_dealer_visits(p_dealer_id uuid, p_limit int default 10)
returns table (
  id         uuid,
  staff_email text,
  staff_name  text,
  notes      text,
  latitude   numeric,
  longitude  numeric,
  visited_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_role  text;
  v_allowed boolean := false;
begin
  select sp.email, sp.role into v_email, v_role
  from public.staff_profiles sp
  where sp.id = v_uid;

  if v_email is null then
    return;
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = p_dealer_id
      and p.deleted_at is null
      and (
        (v_role = 'sales_associate' and p.assigned_sales_rep = v_email)
        or (v_role = 'senior_sales_associate' and (
              p.assigned_sales_rep = v_email
              or p.assigned_sales_rep in (
                select sp2.email from public.staff_profiles sp2 where sp2.reports_to = v_email
              )
            ))
        or (v_role = 'senior_sales_executive' and p.assigned_sales_rep in (
              select sp3.email from public.staff_profiles sp3 where sp3.department = 'Sales'
            ))
      )
  ) into v_allowed;

  if not v_allowed then
    return;
  end if;

  return query
    select
      sv.id,
      sv.staff_email,
      coalesce(sp.name, sv.staff_email) as staff_name,
      sv.notes,
      sv.latitude,
      sv.longitude,
      sv.visited_at
    from public.sales_visits sv
    left join public.staff_profiles sp on sp.email = sv.staff_email
    where sv.dealer_id = p_dealer_id
    order by sv.visited_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_dealer_visits(uuid, int) to authenticated;
