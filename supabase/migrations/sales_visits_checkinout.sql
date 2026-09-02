-- sales_visits_checkinout.sql
--
-- Upgrades visit logging from a single "log a visit" button into a real
-- field-verification check-in / check-out workflow, per Sales team
-- feedback: a visit must happen within 100m of the dealer, check-in
-- requires a "duty on" photo, and check-out requires a board photo, a
-- shop-interior photo, a dealer visiting-card photo, and a short video —
-- all geo-tagged. This replaces the single-tap version shipped in
-- sales_visits.sql (kept, not dropped — see notes below).
--
-- Safe to re-run. Existing rows (the 3 simple test visits already logged)
-- are backfilled as legacy "checked_out" visits so nothing already in the
-- table is lost or orphaned.
--
-- Run in Supabase SQL Editor.

-- ── 1. Extend the table ─────────────────────────────────────────────────

alter table public.sales_visits
  add column if not exists status text not null default 'checked_out',
  add column if not exists check_in_at timestamptz,
  add column if not exists check_in_lat numeric,
  add column if not exists check_in_lng numeric,
  add column if not exists duty_on_photo_url text,
  add column if not exists check_out_at timestamptz,
  add column if not exists check_out_lat numeric,
  add column if not exists check_out_lng numeric,
  add column if not exists board_photo_url text,
  add column if not exists shop_photo_url text,
  add column if not exists card_photo_url text,
  add column if not exists video_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_visits_status_check'
  ) then
    alter table public.sales_visits
      add constraint sales_visits_status_check check (status in ('open', 'checked_out'));
  end if;
end $$;

-- A rep can only have one open (checked-in, not yet checked-out) visit at
-- a time — enforced here, not just in the RPC, as a hard backstop.
create unique index if not exists idx_sales_visits_one_open_per_staff
  on public.sales_visits (staff_email)
  where status = 'open';

-- Backfill: the 3 existing simple-log rows become closed legacy visits so
-- old data still shows up correctly in the new check-in/check-out shaped UI.
update public.sales_visits
set check_in_at  = coalesce(check_in_at, visited_at),
    check_in_lat  = coalesce(check_in_lat, latitude),
    check_in_lng  = coalesce(check_in_lng, longitude),
    check_out_at  = coalesce(check_out_at, visited_at),
    check_out_lat = coalesce(check_out_lat, latitude),
    check_out_lng = coalesce(check_out_lng, longitude)
where status = 'checked_out' and check_in_at is null;

-- Dealer's saved location already exists (profiles.location_lat/lng, added
-- in dealer_profile_expanded.sql) — reused as-is for the 100m geofence and
-- the "first check-in sets the location" fallback. No new dealer columns.

-- ── 2. Haversine distance helper (metres) ───────────────────────────────

create or replace function public._haversine_meters(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2 - lng1) / 2)), 2)
  ));
$$;

-- ── 3. Storage bucket for visit media ───────────────────────────────────

insert into storage.buckets (id, name, public)
  values ('visit-media', 'visit-media', true)
  on conflict (id) do nothing;

-- CREATE POLICY has no IF NOT EXISTS clause in Postgres — drop-then-create
-- is the safe re-runnable equivalent.
drop policy if exists "Public can view visit media" on storage.objects;
create policy "Public can view visit media"
  on storage.objects for select
  using (bucket_id = 'visit-media');

drop policy if exists "Staff can upload visit media" on storage.objects;
create policy "Staff can upload visit media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'visit-media'
    and exists (select 1 from public.staff_profiles sp where sp.id = auth.uid())
  );

-- ── 4. get_my_open_visit() ──────────────────────────────────────────────
-- The caller's current open (checked-in) visit, if any, anywhere. Powers a
-- "you're currently checked in at X" banner and the resume/blocked logic
-- on the dealer detail screen.

create or replace function public.get_my_open_visit()
returns table (
  visit_id     uuid,
  dealer_id    uuid,
  dealer_name  text,
  check_in_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return;
  end if;

  return query
    select sv.id, sv.dealer_id,
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name) as dealer_name,
      sv.check_in_at
    from public.sales_visits sv
    join public.profiles p on p.id = sv.dealer_id
    where sv.staff_email = v_email and sv.status = 'open'
    limit 1;
end;
$$;

grant execute on function public.get_my_open_visit() to authenticated;

-- ── 5. start_dealer_visit() — check-in ──────────────────────────────────

create or replace function public.start_dealer_visit(
  p_dealer_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_duty_on_photo_url text
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

  if p_duty_on_photo_url is null or length(trim(p_duty_on_photo_url)) = 0 then
    return query select false, 'duty-on photo is required to check in'::text, null::uuid;
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
      -- Already checked in here — resume rather than error.
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
    check_in_at, check_in_lat, check_in_lng, duty_on_photo_url,
    visited_at, latitude, longitude
  )
  values (
    p_dealer_id, v_email, 'open',
    now(), p_latitude, p_longitude, p_duty_on_photo_url,
    now(), p_latitude, p_longitude
  )
  returning id into v_new_id;

  return query select true, 'checked in'::text, v_new_id;
end;
$$;

grant execute on function public.start_dealer_visit(uuid, numeric, numeric, text) to authenticated;

-- ── 6. complete_dealer_visit() — check-out ──────────────────────────────

create or replace function public.complete_dealer_visit(
  p_visit_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_board_photo_url text,
  p_shop_photo_url text,
  p_card_photo_url text,
  p_video_url text,
  p_notes text default null
)
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_visit record;
  v_dealer_lat double precision;
  v_dealer_lng double precision;
  v_distance double precision;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return query select false, 'not authenticated as staff'::text;
    return;
  end if;

  select sv.* into v_visit
  from public.sales_visits sv
  where sv.id = p_visit_id and sv.staff_email = v_email and sv.status = 'open';

  if not found then
    return query select false, 'no matching open visit found'::text;
    return;
  end if;

  if p_latitude is null or p_longitude is null then
    return query select false, 'location is required to check out'::text;
    return;
  end if;
  if p_board_photo_url is null or length(trim(p_board_photo_url)) = 0 then
    return query select false, 'shop board photo is required to check out'::text;
    return;
  end if;
  if p_shop_photo_url is null or length(trim(p_shop_photo_url)) = 0 then
    return query select false, 'shop interior photo is required to check out'::text;
    return;
  end if;
  if p_card_photo_url is null or length(trim(p_card_photo_url)) = 0 then
    return query select false, 'dealer visiting card photo is required to check out'::text;
    return;
  end if;
  if p_video_url is null or length(trim(p_video_url)) = 0 then
    return query select false, 'a short shop-interior video is required to check out'::text;
    return;
  end if;

  select p.location_lat, p.location_lng into v_dealer_lat, v_dealer_lng
  from public.profiles p where p.id = v_visit.dealer_id;

  if v_dealer_lat is not null and v_dealer_lng is not null then
    v_distance := public._haversine_meters(v_dealer_lat, v_dealer_lng, p_latitude::double precision, p_longitude::double precision);
    if v_distance > 100 then
      return query select false,
        format('you are about %s m from this dealer — you must be within 100m to check out', round(v_distance)::int)::text;
      return;
    end if;
  end if;

  update public.sales_visits
  set status = 'checked_out',
      check_out_at = now(),
      check_out_lat = p_latitude,
      check_out_lng = p_longitude,
      board_photo_url = p_board_photo_url,
      shop_photo_url = p_shop_photo_url,
      card_photo_url = p_card_photo_url,
      video_url = p_video_url,
      notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_visit_id;

  return query select true, 'checked out'::text;
end;
$$;

grant execute on function public.complete_dealer_visit(uuid, numeric, numeric, text, text, text, text, text) to authenticated;

-- ── 7. Widen get_my_visits() / get_dealer_visits() with the new fields ──
-- Postgres won't let CREATE OR REPLACE change a function's output columns
-- (the "OUT parameters" are part of its signature) — these two are
-- growing from 7 columns to 15, so the old versions must be dropped first.

drop function if exists public.get_my_visits(int);
drop function if exists public.get_dealer_visits(uuid, int);

create or replace function public.get_my_visits(p_limit int default 20)
returns table (
  id              uuid,
  dealer_id       uuid,
  dealer_name     text,
  notes           text,
  latitude        numeric,
  longitude       numeric,
  visited_at      timestamptz,
  status          text,
  check_in_at     timestamptz,
  check_out_at    timestamptz,
  duty_on_photo_url text,
  board_photo_url text,
  shop_photo_url  text,
  card_photo_url  text,
  video_url       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return;
  end if;

  return query
    select
      sv.id, sv.dealer_id,
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name) as dealer_name,
      sv.notes, sv.latitude, sv.longitude, sv.visited_at,
      sv.status, sv.check_in_at, sv.check_out_at,
      sv.duty_on_photo_url, sv.board_photo_url, sv.shop_photo_url, sv.card_photo_url, sv.video_url
    from public.sales_visits sv
    join public.profiles p on p.id = sv.dealer_id
    where sv.staff_email = v_email
    order by sv.visited_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_my_visits(int) to authenticated;

create or replace function public.get_dealer_visits(p_dealer_id uuid, p_limit int default 10)
returns table (
  id              uuid,
  staff_email     text,
  staff_name      text,
  notes           text,
  latitude        numeric,
  longitude       numeric,
  visited_at      timestamptz,
  status          text,
  check_in_at     timestamptz,
  check_out_at    timestamptz,
  duty_on_photo_url text,
  board_photo_url text,
  shop_photo_url  text,
  card_photo_url  text,
  video_url       text
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
  from public.staff_profiles sp where sp.id = v_uid;

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
      sv.id, sv.staff_email,
      coalesce(sp.name, sv.staff_email) as staff_name,
      sv.notes, sv.latitude, sv.longitude, sv.visited_at,
      sv.status, sv.check_in_at, sv.check_out_at,
      sv.duty_on_photo_url, sv.board_photo_url, sv.shop_photo_url, sv.card_photo_url, sv.video_url
    from public.sales_visits sv
    left join public.staff_profiles sp on sp.email = sv.staff_email
    where sv.dealer_id = p_dealer_id
    order by sv.visited_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_dealer_visits(uuid, int) to authenticated;

-- log_dealer_visit() from sales_visits.sql is intentionally left in place,
-- unused by the new UI — no harm keeping it, and it's a smaller fallback
-- RPC if ever needed again.
