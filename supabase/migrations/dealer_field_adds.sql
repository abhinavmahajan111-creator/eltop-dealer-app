-- dealer_field_adds.sql
--
-- Lets a Sales rep add a brand-new dealer directly from the field (Check
-- In screen) and immediately check in/out there — WITHOUT waiting for
-- admin approval. Requested 9 Sept 2026: "sales ka banda new dealer add
-- karke check in checkout zarur kar sake, approve na bhi hua ho tab bhi."
--
-- Why a separate table instead of just inserting into public.profiles:
-- profiles.id is a hard foreign key to auth.users(id) — a dealer only
-- gets a profiles row once they (or an admin) create a real login
-- account. A field-added dealer usually doesn't have one yet (the rep is
-- standing in their shop, not creating them a login on the spot), so
-- there's no auth.users row to point at. Rather than fabricate one,
-- field-added dealers live in their own lightweight table until someone
-- actually onboards them for real (self-signup or Admin → Dealers &
-- Customers) — at which point they become a normal profiles row like any
-- other dealer, same as today.
--
-- sales_visits already enforces "one open visit at a time" and the 100m
-- checkin/checkout geofence per dealer — that logic is reused as-is for
-- field-added dealers too, anchored to the location captured when the
-- rep added them (no "first check-in sets location" special case needed,
-- since it's already set at add-time).
--
-- Approval here is an oversight/audit step only — it does NOT gate
-- check-in/check-out (that would defeat the whole point: a rep who just
-- walked into a brand-new shop needs to log the visit right now, not
-- after someone in the office reviews it later). Rejecting a submission
-- only blocks *future* check-ins there; past visit history is untouched.
--
-- Run in Supabase SQL Editor.

-- ── 1. dealer_field_adds — a rep's own new-dealer submissions ───────────

create table if not exists public.dealer_field_adds (
  id             uuid primary key default gen_random_uuid(),
  shop_name      text not null,
  owner_name     text,
  phone          text,
  address        text,
  location_lat   double precision not null,
  location_lng   double precision not null,
  added_by_email text not null references public.staff_profiles(email) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by    text,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_dealer_field_adds_added_by on public.dealer_field_adds(added_by_email);
create index if not exists idx_dealer_field_adds_status on public.dealer_field_adds(status);

alter table public.dealer_field_adds enable row level security;
-- No policies — SECURITY DEFINER functions only, same pattern as sales_visits.

-- ── 2. add_field_dealer() — a rep adds a new dealer from the field ──────

create or replace function public.add_field_dealer(
  p_shop_name  text,
  p_owner_name text,
  p_phone      text,
  p_address    text,
  p_latitude   double precision,
  p_longitude  double precision
)
returns table (success boolean, message text, field_dealer_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_new_id uuid;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return query select false, 'not authenticated as staff'::text, null::uuid;
    return;
  end if;

  if p_shop_name is null or length(trim(p_shop_name)) = 0 then
    return query select false, 'shop name is required'::text, null::uuid;
    return;
  end if;

  if p_latitude is null or p_longitude is null then
    return query select false, 'location is required to add a new dealer'::text, null::uuid;
    return;
  end if;

  insert into public.dealer_field_adds (
    shop_name, owner_name, phone, address, location_lat, location_lng, added_by_email
  )
  values (
    trim(p_shop_name), nullif(trim(coalesce(p_owner_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_address, '')), ''),
    p_latitude, p_longitude, v_email
  )
  returning id into v_new_id;

  return query select true, 'added'::text, v_new_id;
end;
$$;

grant execute on function public.add_field_dealer(text, text, text, double precision, double precision) to authenticated;

-- ── 3. sales_visits can now point at either table ────────────────────────

alter table public.sales_visits
  alter column dealer_id drop not null,
  add column if not exists field_dealer_id uuid references public.dealer_field_adds(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_visits_one_dealer_ref'
  ) then
    alter table public.sales_visits
      add constraint sales_visits_one_dealer_ref
      check ((dealer_id is not null) <> (field_dealer_id is not null));
  end if;
end $$;

-- ── 4. start_dealer_visit() — also accept a field-added dealer ──────────
-- Same signature as before, CREATE OR REPLACE just swaps the body.

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
  v_is_field boolean := false;
  v_today date;
  v_day_ended timestamptz;
  v_dealer_lat double precision;
  v_dealer_lng double precision;
  v_distance double precision;
  v_open_id uuid;
  v_open_dealer_id uuid;
  v_open_field_id uuid;
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
    -- Not a real assigned dealer — is it one this rep added themself in
    -- the field? (Own submissions only, not a teammate's — and not one
    -- admin has since rejected.)
    select exists (
      select 1 from public.dealer_field_adds dfa
      where dfa.id = p_dealer_id and dfa.added_by_email = v_email and dfa.status <> 'rejected'
    ) into v_is_field;

    if not v_is_field then
      return query select false, 'dealer not in your assigned list'::text, null::uuid;
      return;
    end if;
  end if;

  -- Only one open visit per rep at a time.
  select sv.id, sv.dealer_id, sv.field_dealer_id into v_open_id, v_open_dealer_id, v_open_field_id
  from public.sales_visits sv
  where sv.staff_email = v_email and sv.status = 'open'
  limit 1;

  if v_open_id is not null then
    if (not v_is_field and v_open_dealer_id = p_dealer_id) or (v_is_field and v_open_field_id = p_dealer_id) then
      return query select true, 'already checked in'::text, v_open_id;
      return;
    else
      return query select false, 'you are already checked in at another dealer — check out there first'::text, null::uuid;
      return;
    end if;
  end if;

  if v_is_field then
    select dfa.location_lat, dfa.location_lng into v_dealer_lat, v_dealer_lng
    from public.dealer_field_adds dfa where dfa.id = p_dealer_id;
  else
    select p.location_lat, p.location_lng into v_dealer_lat, v_dealer_lng
    from public.profiles p where p.id = p_dealer_id;
  end if;

  if v_dealer_lat is null or v_dealer_lng is null then
    -- First-ever check-in for this dealer sets its location. Only applies
    -- to real dealers — a field-added dealer always has a location
    -- already (captured when the rep added it).
    if not v_is_field then
      update public.profiles
      set location_lat = p_latitude, location_lng = p_longitude
      where id = p_dealer_id;
    end if;
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
    dealer_id, field_dealer_id, staff_email, status,
    check_in_at, check_in_lat, check_in_lng,
    visited_at, latitude, longitude
  )
  values (
    case when v_is_field then null else p_dealer_id end,
    case when v_is_field then p_dealer_id else null end,
    v_email, 'open',
    now(), p_latitude, p_longitude,
    now(), p_latitude, p_longitude
  )
  returning id into v_new_id;

  return query select true, 'checked in'::text, v_new_id;
end;
$$;

grant execute on function public.start_dealer_visit(uuid, numeric, numeric) to authenticated;

-- ── 5. complete_dealer_visit() — geofence anchor from whichever table ───
-- Same signature as before.

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

  if v_visit.field_dealer_id is not null then
    select dfa.location_lat, dfa.location_lng into v_dealer_lat, v_dealer_lng
    from public.dealer_field_adds dfa where dfa.id = v_visit.field_dealer_id;
  else
    select p.location_lat, p.location_lng into v_dealer_lat, v_dealer_lng
    from public.profiles p where p.id = v_visit.dealer_id;
  end if;

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

-- ── 6. get_my_dealers() — include the rep's own field-added dealers ─────
-- New output column (dealer_kind), so the old version must be dropped.

drop function if exists public.get_my_dealers();

create or replace function public.get_my_dealers()
returns table (
  id          uuid,
  name        text,
  dealer_code text,
  territory   jsonb,
  outstanding numeric,
  dealer_kind text  -- 'profile' | 'field_pending' | 'field_approved'
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
    return;
  end if;

  return query
    select * from (
      select
        p.id,
        coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name) as name,
        p.dealer_code,
        to_jsonb(p.territory) as territory,
        coalesce(led.balance, 0) as outstanding,
        'profile'::text as dealer_kind
      from public.profiles p
      left join (
        select dealer_id,
          sum(case
                when type = 'order' or (type = 'journal' and dr_dealer) then amount
                when type = 'payment' or type = 'credit_note' or (type = 'journal' and cr_dealer) then -amount
                else 0
              end) as balance
        from public.dealer_ledger
        group by dealer_id
      ) led on led.dealer_id = p.id
      where p.deleted_at is null
        and (
          (v_role = 'sales_associate' and p.assigned_sales_rep = v_email)
          or (v_role = 'senior_sales_associate' and (
                p.assigned_sales_rep = v_email
                or p.assigned_sales_rep in (
                  select email from public.staff_profiles where reports_to = v_email
                )
              ))
          or (v_role = 'senior_sales_executive' and p.assigned_sales_rep in (
                select email from public.staff_profiles where department = 'Sales'
              ))
        )

      union all

      select
        dfa.id,
        dfa.shop_name as name,
        'NEW'::text as dealer_code,
        null::jsonb as territory,
        0::numeric as outstanding,
        ('field_' || dfa.status)::text as dealer_kind
      from public.dealer_field_adds dfa
      where dfa.added_by_email = v_email and dfa.status <> 'rejected'
    ) combined
    order by name;
end;
$$;

grant execute on function public.get_my_dealers() to authenticated;

-- ── 7. get_my_open_visit() / get_my_visits() — resolve name either way ──
-- Output columns unchanged, so CREATE OR REPLACE just swaps the body.

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
    select sv.id,
      coalesce(sv.dealer_id, sv.field_dealer_id),
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name, dfa.shop_name),
      sv.check_in_at
    from public.sales_visits sv
    left join public.profiles p on p.id = sv.dealer_id
    left join public.dealer_field_adds dfa on dfa.id = sv.field_dealer_id
    where sv.staff_email = v_email and sv.status = 'open'
    limit 1;
end;
$$;

grant execute on function public.get_my_open_visit() to authenticated;

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
      sv.id, coalesce(sv.dealer_id, sv.field_dealer_id),
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name, dfa.shop_name),
      sv.notes, sv.latitude, sv.longitude, sv.visited_at,
      sv.status, sv.check_in_at, sv.check_out_at,
      sv.duty_on_photo_url, sv.board_photo_url, sv.shop_photo_url, sv.card_photo_url, sv.video_url
    from public.sales_visits sv
    left join public.profiles p on p.id = sv.dealer_id
    left join public.dealer_field_adds dfa on dfa.id = sv.field_dealer_id
    where sv.staff_email = v_email
    order by sv.visited_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_my_visits(int) to authenticated;

-- ── 8. get_my_day_activity() — resolve dealer name either way ───────────
-- Output columns unchanged.

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
      'Checked in at ' || coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name, dfa.shop_name, 'dealer'),
      null::text,
      sv.check_in_at
    from public.sales_visits sv
    left join public.profiles p on p.id = sv.dealer_id
    left join public.dealer_field_adds dfa on dfa.id = sv.field_dealer_id
    where sv.staff_email = v_email
      and sv.check_in_at is not null
      and (sv.check_in_at at time zone 'Asia/Kolkata')::date = v_today

    union all

    select
      'checkout'::text,
      'Checked out from ' || coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name, dfa.shop_name, 'dealer'),
      sv.notes,
      sv.check_out_at
    from public.sales_visits sv
    left join public.profiles p on p.id = sv.dealer_id
    left join public.dealer_field_adds dfa on dfa.id = sv.field_dealer_id
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

-- ── 9. admin_get_all_visits() — show field-added dealers too ────────────
-- New output column (is_field_dealer), so the old version must be dropped.

drop function if exists public.admin_get_all_visits(int, text, text);

create or replace function public.admin_get_all_visits(
  p_limit  int  default 200,
  p_status text default null,
  p_search text default null
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
  force_checkout_reason text,
  is_field_dealer       boolean
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
      sv.id, coalesce(sv.dealer_id, sv.field_dealer_id),
      coalesce(p.name, dfa.shop_name),
      coalesce(p.dealer_code, 'NEW'),
      sv.staff_email, sp.name,
      sv.status, sv.check_in_at, sv.check_in_lat, sv.check_in_lng,
      sv.check_out_at, sv.check_out_lat, sv.check_out_lng,
      sv.notes, sv.forced_checkout, sv.force_checkout_by, sv.force_checkout_reason,
      (sv.field_dealer_id is not null)
    from public.sales_visits sv
    left join public.profiles p on p.id = sv.dealer_id
    left join public.dealer_field_adds dfa on dfa.id = sv.field_dealer_id
    left join public.staff_profiles sp on sp.email = sv.staff_email
    where (p_status is null or sv.status = p_status)
      and (p_search is null or length(trim(p_search)) = 0
           or p.name ilike '%' || trim(p_search) || '%'
           or dfa.shop_name ilike '%' || trim(p_search) || '%'
           or p.dealer_code ilike '%' || trim(p_search) || '%'
           or sp.name ilike '%' || trim(p_search) || '%'
           or sv.staff_email ilike '%' || trim(p_search) || '%')
    order by coalesce(sv.check_in_at, sv.visited_at) desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.admin_get_all_visits(int, text, text) to authenticated;

-- ── 10. Admin review queue for field-added dealers ───────────────────────

create or replace function public.admin_list_field_dealers(p_status text default 'pending')
returns table (
  id             uuid,
  shop_name      text,
  owner_name     text,
  phone          text,
  address        text,
  location_lat   double precision,
  location_lng   double precision,
  added_by_email text,
  added_by_name  text,
  status         text,
  reviewed_by    text,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz
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
      dfa.id, dfa.shop_name, dfa.owner_name, dfa.phone, dfa.address,
      dfa.location_lat, dfa.location_lng,
      dfa.added_by_email, coalesce(sp.name, dfa.added_by_email),
      dfa.status, dfa.reviewed_by, dfa.reviewed_at, dfa.review_note,
      dfa.created_at
    from public.dealer_field_adds dfa
    left join public.staff_profiles sp on sp.email = dfa.added_by_email
    where (p_status is null or dfa.status = p_status)
    order by dfa.created_at desc;
end;
$$;

grant execute on function public.admin_list_field_dealers(text) to authenticated;

create or replace function public.admin_review_field_dealer(
  p_id     uuid,
  p_status text,
  p_note   text default null
)
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

  if p_status not in ('approved', 'rejected') then
    return query select false, 'status must be approved or rejected'::text;
    return;
  end if;

  select a.email into v_admin_email from public.admins a where a.id = auth.uid();

  if not exists (select 1 from public.dealer_field_adds where id = p_id) then
    return query select false, 'submission not found'::text;
    return;
  end if;

  update public.dealer_field_adds
  set status = p_status,
      reviewed_by = coalesce(v_admin_email, 'admin'),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id;

  return query select true, 'ok'::text;
end;
$$;

grant execute on function public.admin_review_field_dealer(uuid, text, text) to authenticated;
