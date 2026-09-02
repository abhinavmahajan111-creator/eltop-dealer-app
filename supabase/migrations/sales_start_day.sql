-- sales_start_day.sql
--
-- Separates "starting the day" from "checking in at a shop" — per
-- feedback: a rep can start their day somewhere else entirely (not at a
-- dealer), with a photo of their bike/vehicle's meter (odometer) reading,
-- and then go on to check in at their first shop. So:
--   - Start Day: once per (IST) calendar day, no geofence (can happen
--     anywhere), requires a meter-reading photo.
--   - Check In at a shop: unchanged 100m geofence, but no longer requires
--     its own "duty on" photo — that concept now lives in Start Day. A
--     rep must have started their day before they can check in anywhere.
--
-- Run in Supabase SQL Editor, after sales_visits_checkinout.sql.

-- ── 1. sales_day_starts table ───────────────────────────────────────────

create table if not exists public.sales_day_starts (
  id               uuid primary key default gen_random_uuid(),
  staff_email      text not null references public.staff_profiles(email) on delete cascade,
  work_date        date not null,
  started_at       timestamptz not null default now(),
  latitude         numeric,
  longitude        numeric,
  meter_photo_url  text not null
);

-- One start per staff per (IST) calendar day.
create unique index if not exists idx_sales_day_starts_one_per_day
  on public.sales_day_starts (staff_email, work_date);

alter table public.sales_day_starts enable row level security;
-- No policies — every read/write goes through the SECURITY DEFINER
-- functions below, same pattern as sales_visits.

-- ── 2. get_my_day_start() — today's start, if any ───────────────────────

create or replace function public.get_my_day_start()
returns table (
  id              uuid,
  work_date       date,
  started_at      timestamptz,
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
    select sds.id, sds.work_date, sds.started_at, sds.latitude, sds.longitude, sds.meter_photo_url
    from public.sales_day_starts sds
    where sds.staff_email = v_email and sds.work_date = v_today
    limit 1;
end;
$$;

grant execute on function public.get_my_day_start() to authenticated;

-- ── 3. start_day() — no geofence, meter photo required ──────────────────

create or replace function public.start_day(
  p_latitude numeric,
  p_longitude numeric,
  p_meter_photo_url text
)
returns table (success boolean, message text, day_start_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_today date;
  v_existing_id uuid;
  v_new_id uuid;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return query select false, 'not authenticated as staff'::text, null::uuid;
    return;
  end if;

  if p_meter_photo_url is null or length(trim(p_meter_photo_url)) = 0 then
    return query select false, 'a photo of your bike/vehicle meter reading is required to start your day'::text, null::uuid;
    return;
  end if;

  v_today := (now() at time zone 'Asia/Kolkata')::date;

  select sds.id into v_existing_id
  from public.sales_day_starts sds
  where sds.staff_email = v_email and sds.work_date = v_today;

  if v_existing_id is not null then
    -- Idempotent — resume rather than error, same pattern as start_dealer_visit.
    return query select true, 'day already started'::text, v_existing_id;
    return;
  end if;

  insert into public.sales_day_starts (staff_email, work_date, latitude, longitude, meter_photo_url)
  values (v_email, v_today, p_latitude, p_longitude, p_meter_photo_url)
  returning id into v_new_id;

  return query select true, 'day started'::text, v_new_id;
end;
$$;

grant execute on function public.start_day(numeric, numeric, text) to authenticated;

-- ── 4. start_dealer_visit() — drop the duty-on-photo requirement, add ──
-- ── the "day must be started" gate instead ──────────────────────────────
-- Signature is changing (losing the p_duty_on_photo_url param), so the
-- old 4-arg version must be dropped explicitly first — CREATE OR REPLACE
-- can't change a function's parameter list, only its body.

drop function if exists public.start_dealer_visit(uuid, numeric, numeric, text);

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
