-- sales_day_end_and_activity.sql
--
-- Builds out the Day / Check-In split approved in the mockup:
--   - A day can be explicitly ended (sales_day_starts.ended_at). Once
--     ended, no more check-ins are allowed until a new day is started
--     tomorrow — closes the attendance-confusion gap where a check-in
--     could still be logged after the rep had "ended" their day.
--   - A day can't be ended while a visit is still open — must check out
--     first, otherwise that visit would hang open forever.
--   - A running "Day Activity" log — day start/end, check-ins/outs, and
--     free-text notes the rep adds themselves — all scoped to today
--     (IST) and the caller.
--
-- Run in Supabase SQL Editor, after sales_start_day.sql.

-- ── 1. sales_day_starts gains an end time ───────────────────────────────

alter table public.sales_day_starts add column if not exists ended_at timestamptz;

-- ── 2. sales_day_notes — free-text entries a rep adds to their own day ──

create table if not exists public.sales_day_notes (
  id          uuid primary key default gen_random_uuid(),
  staff_email text not null references public.staff_profiles(email) on delete cascade,
  work_date   date not null,
  note        text not null,
  created_at  timestamptz not null default now()
);

alter table public.sales_day_notes enable row level security;
-- No policies — SECURITY DEFINER functions only, same pattern as sales_visits.

-- ── 3. get_my_day_start() — widen to include ended_at ───────────────────
-- Return shape is changing, so the old version must be dropped first.

drop function if exists public.get_my_day_start();

create or replace function public.get_my_day_start()
returns table (
  id              uuid,
  work_date       date,
  started_at      timestamptz,
  ended_at        timestamptz,
  latitude        numeric,
  longitude       numeric,
  meter_photo_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_today date;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return;
  end if;

  v_today := (now() at time zone 'Asia/Kolkata')::date;

  return query
    select sds.id, sds.work_date, sds.started_at, sds.ended_at, sds.latitude, sds.longitude, sds.meter_photo_url
    from public.sales_day_starts sds
    where sds.staff_email = v_email and sds.work_date = v_today
    limit 1;
end;
$$;

grant execute on function public.get_my_day_start() to authenticated;

-- ── 4. end_day() — blocked by an open visit ─────────────────────────────

create or replace function public.end_day()
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_today date;
  v_day_id uuid;
  v_open_visit_id uuid;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return query select false, 'not authenticated as staff'::text;
    return;
  end if;

  v_today := (now() at time zone 'Asia/Kolkata')::date;

  select sds.id into v_day_id
  from public.sales_day_starts sds
  where sds.staff_email = v_email and sds.work_date = v_today;

  if v_day_id is null then
    return query select false, 'you have not started your day yet'::text;
    return;
  end if;

  select sv.id into v_open_visit_id
  from public.sales_visits sv
  where sv.staff_email = v_email and sv.status = 'open'
  limit 1;

  if v_open_visit_id is not null then
    return query select false, 'check out at your current dealer before ending the day'::text;
    return;
  end if;

  update public.sales_day_starts
  set ended_at = now()
  where id = v_day_id and ended_at is null;

  return query select true, 'day ended'::text;
end;
$$;

grant execute on function public.end_day() to authenticated;

-- ── 5. add_day_note() — a rep's own free-text activity entry ────────────

create or replace function public.add_day_note(p_note text)
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_today date;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return query select false, 'not authenticated as staff'::text;
    return;
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    return query select false, 'note cannot be empty'::text;
    return;
  end if;

  v_today := (now() at time zone 'Asia/Kolkata')::date;

  if not exists (
    select 1 from public.sales_day_starts sds
    where sds.staff_email = v_email and sds.work_date = v_today
  ) then
    return query select false, 'start your day first'::text;
    return;
  end if;

  insert into public.sales_day_notes (staff_email, work_date, note)
  values (v_email, v_today, trim(p_note));

  return query select true, 'note added'::text;
end;
$$;

grant execute on function public.add_day_note(text) to authenticated;

-- ── 6. get_my_day_activity() — the unified timeline for today ───────────

create or replace function public.get_my_day_activity()
returns table (
  kind        text,
  description text,
  note        text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_today date;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return;
  end if;

  v_today := (now() at time zone 'Asia/Kolkata')::date;

  return query
    select 'start'::text, 'Day started'::text, null::text, sds.started_at
    from public.sales_day_starts sds
    where sds.staff_email = v_email and sds.work_date = v_today

    union all

    select 'end'::text, 'Day ended'::text, null::text, sds.ended_at
    from public.sales_day_starts sds
    where sds.staff_email = v_email and sds.work_date = v_today and sds.ended_at is not null

    union all

    select
      'checkin'::text,
      'Checked in at ' || coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name, 'dealer'),
      null::text,
      sv.check_in_at
    from public.sales_visits sv
    join public.profiles p on p.id = sv.dealer_id
    where sv.staff_email = v_email
      and sv.check_in_at is not null
      and (sv.check_in_at at time zone 'Asia/Kolkata')::date = v_today

    union all

    select
      'checkout'::text,
      'Checked out from ' || coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name, 'dealer'),
      sv.notes,
      sv.check_out_at
    from public.sales_visits sv
    join public.profiles p on p.id = sv.dealer_id
    where sv.staff_email = v_email
      and sv.check_out_at is not null
      and (sv.check_out_at at time zone 'Asia/Kolkata')::date = v_today

    union all

    select 'note'::text, 'Note added'::text, sdn.note, sdn.created_at
    from public.sales_day_notes sdn
    where sdn.staff_email = v_email and sdn.work_date = v_today

    order by 4 asc;
end;
$$;

grant execute on function public.get_my_day_activity() to authenticated;

-- ── 7. start_dealer_visit() — also block once the day has ended ─────────
-- Same signature as before (uuid, numeric, numeric), so CREATE OR REPLACE
-- can just swap the body — no drop needed this time.

create or replace function public.start_dealer_visit(
  p_dealer_id uuid,
  p_latitude numeric,
  p_longitude numeric
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
  v_today date;
  v_day_ended timestamptz;
  v_dealer_lat double precision;
  v_dealer_lng double precision;
  v_distance double precision;
  v_open_id uuid;
  v_open_dealer_id uuid;
  v_new_id uuid;
begin
  select sp.email, sp.role into v_email, v_role
  from public.staff_profiles sp where sp.id = v_uid;

  if v_email is null then
    return query select false, 'not authenticated as staff'::text, null::uuid;
    return;
  end if;

  if p_latitude is null or p_longitude is null then
    return query select false, 'location is required to check in'::text, null::uuid;
    return;
  end if;

  v_today := (now() at time zone 'Asia/Kolkata')::date;

  select sds.ended_at into v_day_ended
  from public.sales_day_starts sds
  where sds.staff_email = v_email and sds.work_date = v_today;

  if v_day_ended is not null then
    return query select false, 'your day has ended — start a new day tomorrow'::text, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from public.sales_day_starts sds
    where sds.staff_email = v_email and sds.work_date = v_today
  ) then
    return query select false, 'start your day first'::text, null::uuid;
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

  -- Only one open visit per rep at a time.
  select sv.id, sv.dealer_id into v_open_id, v_open_dealer_id
  from public.sales_visits sv
  where sv.staff_email = v_email and sv.status = 'open'
  limit 1;

  if v_open_id is not null then
    if v_open_dealer_id = p_dealer_id then
      return query select true, 'already checked in'::text, v_open_id;
      return;
    else
      return query select false, 'you are already checked in at another dealer — check out there first'::text, null::uuid;
      return;
    end if;
  end if;

  select p.location_lat, p.location_lng into v_dealer_lat, v_dealer_lng
  from public.profiles p where p.id = p_dealer_id;

  if v_dealer_lat is null or v_dealer_lng is null then
    -- First-ever check-in for this dealer sets its location.
    update public.profiles
    set location_lat = p_latitude, location_lng = p_longitude
    where id = p_dealer_id;
  else
    v_distance := public._haversine_meters(v_dealer_lat, v_dealer_lng, p_latitude::double precision, p_longitude::double precision);
    if v_distance > 100 then
      return query select false,
        format('you are about %s m from this dealer — you must be within 100m to check in', round(v_distance)::int)::text,
        null::uuid;
      return;
    end if;
  end if;

  insert into public.sales_visits (
    dealer_id, staff_email, status,
    check_in_at, check_in_lat, check_in_lng,
    visited_at, latitude, longitude
  )
  values (
    p_dealer_id, v_email, 'open',
    now(), p_latitude, p_longitude,
    now(), p_latitude, p_longitude
  )
  returning id into v_new_id;

  return query select true, 'checked in'::text, v_new_id;
end;
$$;

grant execute on function public.start_dealer_visit(uuid, numeric, numeric) to authenticated;
