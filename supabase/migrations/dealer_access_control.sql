-- dealer_access_control.sql
--
-- Implements the "Dealer Visibility vs Ledger Access Control" design
-- (see project doc Eltop_Dealer_Access_Control_Design_10Sep2026.md,
-- finalized 10 Sep 2026). Splits what used to be one bundled gate
-- (profiles.assigned_sales_rep, cascaded through the Sales hierarchy)
-- into two independent things:
--
--   R1/R2 — visibility + check-in become UNIVERSAL: every active Sales
--   staff member sees every dealer (real or field-added) and can check
--   in/out anywhere, regardless of who owns/added it.
--
--   R3/R4 — the LEDGER (Overview/Ledger/Orders/Insights — outstanding,
--   credit limit, discounts, order history) stays restricted to the
--   owner, whoever's above the owner in the hierarchy (unchanged from
--   today's cascade), or anyone explicitly granted access. Grant/revoke
--   power belongs to Senior Sales Associate (scoped to their own
--   ledger-visible dealers + their own reports) and Senior Sales
--   Executive (full override, any dealer, any Sales staff member).
--
-- Run in Supabase SQL Editor, top to bottom.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. dealer_access_grants — who's been granted ledger access to what
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.dealer_access_grants (
  id            uuid primary key default gen_random_uuid(),
  dealer_id     uuid not null references public.profiles(id) on delete cascade,
  grantee_email text not null references public.staff_profiles(email),
  granted_by    text not null references public.staff_profiles(email),
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,        -- soft-delete; keeps a full audit trail
  revoked_by    text references public.staff_profiles(email),
  unique (dealer_id, grantee_email)
);

create index if not exists idx_dealer_access_grants_dealer on public.dealer_access_grants(dealer_id);
create index if not exists idx_dealer_access_grants_grantee on public.dealer_access_grants(grantee_email);

alter table public.dealer_access_grants enable row level security;
-- No policies — SECURITY DEFINER functions only, same pattern as dealer_field_adds.

-- ═══════════════════════════════════════════════════════════════════════
-- 2. staff_notifications — lightweight in-app notification feed
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.staff_notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_email text not null references public.staff_profiles(email) on delete cascade,
  kind           text not null default 'ledger_access_granted',
  title          text not null,
  body           text,
  dealer_id      uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);

create index if not exists idx_staff_notifications_recipient on public.staff_notifications(recipient_email, read_at);

alter table public.staff_notifications enable row level security;
-- No policies — SECURITY DEFINER functions only.

-- ═══════════════════════════════════════════════════════════════════════
-- 3. _dealer_has_ledger_access() — shared R3 formula, used everywhere
--    below so this logic lives in exactly one place.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public._dealer_has_ledger_access(
  p_dealer_id    uuid,
  p_viewer_email text,
  p_viewer_role  text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = p_dealer_id
        and p.deleted_at is null
        and (
          p.assigned_sales_rep = p_viewer_email
          or (p_viewer_role = 'senior_sales_associate' and p.assigned_sales_rep in (
                select sp.email from public.staff_profiles sp where sp.reports_to = p_viewer_email
              ))
          or (p_viewer_role = 'senior_sales_executive' and p.assigned_sales_rep in (
                select sp.email from public.staff_profiles sp where sp.department = 'Sales'
              ))
        )
    )
    or exists (
      select 1 from public.dealer_access_grants g
      where g.dealer_id = p_dealer_id
        and g.grantee_email = p_viewer_email
        and g.revoked_at is null
    );
$$;

grant execute on function public._dealer_has_ledger_access(uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. get_my_dealers() — R1: universal directory + has_ledger_access flag
--    New output columns, so the old signature must be dropped first.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.get_my_dealers();

create or replace function public.get_my_dealers()
returns table (
  id          uuid,
  name        text,
  dealer_code text,
  territory   jsonb,
  outstanding numeric,           -- null when the viewer has no ledger access (R3) — never sent to the client otherwise
  dealer_kind text,              -- 'profile' | 'field_pending' | 'field_approved'
  alias_name  text,
  has_ledger_access boolean,
  owner_name  text               -- resolved owner (profile) / added-by (field) name, for display
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
        case when public._dealer_has_ledger_access(p.id, v_email, v_role)
             then coalesce(led.balance, 0) else null end as outstanding,
        'profile'::text as dealer_kind,
        null::text as alias_name,
        public._dealer_has_ledger_access(p.id, v_email, v_role) as has_ledger_access,
        coalesce(osp.name, p.assigned_sales_rep) as owner_name
      from public.profiles p
      left join public.staff_profiles osp on osp.email = p.assigned_sales_rep
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
      -- R1 — universal directory: every active Sales staff member sees
      -- every real dealer now, regardless of assigned_sales_rep. Ownership
      -- only decides has_ledger_access below, not whether the row shows up.

      union all

      select
        dfa.id,
        dfa.shop_name as name,
        'NEW'::text as dealer_code,
        null::jsonb as territory,
        0::numeric as outstanding,
        ('field_' || dfa.status)::text as dealer_kind,
        dfa.alias_name,
        true as has_ledger_access,  -- field leads have no ledger to gate
        coalesce(asp.name, dfa.added_by_email) as owner_name
      from public.dealer_field_adds dfa
      left join public.staff_profiles asp on asp.email = dfa.added_by_email
      where dfa.status <> 'rejected'
      -- Universal here too (R1) — every rep's pending/approved field leads
      -- now show to every rep, not just whoever added it. Rejected leads
      -- stay excluded from the list (R1a instead surfaces them as a
      -- duplicate-phone-match warning at add-time — see
      -- check_duplicate_dealer_phone below).
    ) combined
    order by name;
end;
$$;

grant execute on function public.get_my_dealers() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. get_dealer_detail() — universal profile visibility, ledger fields
--    gated on has_ledger_access. New output columns, drop first.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.get_dealer_detail(uuid);

create or replace function public.get_dealer_detail(p_dealer_id uuid)
returns table (
  id            uuid,
  name          text,
  dealer_code   text,
  phone         text,
  phone2        text,
  email         text,
  address       text,
  shop_address  text,
  gstin         text,
  territory     jsonb,
  credit_limit  numeric,
  discount1     numeric,
  discount2     numeric,
  outstanding   numeric,
  has_ledger_access boolean,
  owner_email   text,
  owner_name    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_role  text;
  v_has_access boolean;
begin
  select sp.email, sp.role into v_email, v_role
  from public.staff_profiles sp
  where sp.id = v_uid;

  if v_email is null then
    return;
  end if;

  -- R2 — profile visibility is universal now: any active Sales staff
  -- member can open any non-deleted dealer's profile page. Only the
  -- ledger-shaped fields below are gated on has_ledger_access.
  if not exists (select 1 from public.profiles p where p.id = p_dealer_id and p.deleted_at is null) then
    return;
  end if;

  v_has_access := public._dealer_has_ledger_access(p_dealer_id, v_email, v_role);

  return query
    select
      p.id,
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name) as name,
      p.dealer_code,
      p.phone,
      p.phone2,
      p.email,
      coalesce(nullif(p.shop_address, ''), p.address) as address,
      p.shop_address,
      p.gstin,
      to_jsonb(p.territory) as territory,
      case when v_has_access then p.credit_limit else null end as credit_limit,
      case when v_has_access then p.discount1 else null end as discount1,
      case when v_has_access then p.discount2 else null end as discount2,
      case when v_has_access then coalesce(led.balance, 0) else null end as outstanding,
      v_has_access as has_ledger_access,
      p.assigned_sales_rep as owner_email,
      coalesce(osp.name, p.assigned_sales_rep) as owner_name
    from public.profiles p
    left join public.staff_profiles osp on osp.email = p.assigned_sales_rep
    left join (
      select dl.dealer_id,
        sum(case
              when dl.type = 'order' or (dl.type = 'journal' and dl.dr_dealer) then dl.amount
              when dl.type = 'payment' or dl.type = 'credit_note' or (dl.type = 'journal' and dl.cr_dealer) then -dl.amount
              else 0
            end) as balance
      from public.dealer_ledger dl
      where dl.dealer_id = p_dealer_id
      group by dl.dealer_id
    ) led on led.dealer_id = p.id
    where p.id = p_dealer_id;
end;
$$;

grant execute on function public.get_dealer_detail(uuid) to authenticated;

-- get_dealer_orders() — Orders tab is ledger data (R3), gated the same
-- way. Params/output columns unchanged, so CREATE OR REPLACE is enough.

create or replace function public.get_dealer_orders(p_dealer_id uuid, p_limit int default 20)
returns table (
  id         uuid,
  status     text,
  total      numeric,
  created_at timestamptz
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

  if not public._dealer_has_ledger_access(p_dealer_id, v_email, v_role) then
    return;
  end if;

  return query
    select o.id, o.status, o.total, o.created_at
    from public.orders o
    where o.dealer_id = p_dealer_id
    order by o.created_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_dealer_orders(uuid, int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. start_dealer_visit() — R2: universal check-in, no ownership gate.
--    Same signature as before, CREATE OR REPLACE just swaps the body.
-- ═══════════════════════════════════════════════════════════════════════

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
  select sp.email into v_email
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

  -- R2 — universal check-in: any active Sales staff member can check in
  -- at any dealer, real or field-added, regardless of who owns/added it.
  -- The only requirement is that the dealer actually exists (and, for a
  -- field lead, hasn't since been rejected).
  if exists (select 1 from public.profiles p where p.id = p_dealer_id and p.deleted_at is null) then
    v_is_field := false;
  elsif exists (select 1 from public.dealer_field_adds dfa where dfa.id = p_dealer_id and dfa.status <> 'rejected') then
    v_is_field := true;
  else
    return query select false, 'dealer not found'::text, null::uuid;
    return;
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

-- get_dealer_visits() — the Visits tab's "recent visits here" list.
-- Check-in is universal now (R2), so this needs to be too — otherwise a
-- rep who isn't the owner could check in but then see an empty visit
-- history on the same dealer, including their own visit they just
-- logged. Same params/output columns as before, just drops the
-- ownership gate — CREATE OR REPLACE is enough.

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
begin
  select sp.email into v_email
  from public.staff_profiles sp where sp.id = v_uid;

  if v_email is null then
    return;
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_dealer_id and p.deleted_at is null) then
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
    order by coalesce(sv.check_in_at, sv.visited_at) desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_dealer_visits(uuid, int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. check_duplicate_dealer_phone() — R1a: distinguish a rejected-lead
--    match with its own match_type, so the client can show a specifically-
--    worded "this might be a previously-rejected dealer" caution instead
--    of folding it into the generic duplicate warning. Output columns
--    changed, so the old signature must be dropped first.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.check_duplicate_dealer_phone(text, text);

create or replace function public.check_duplicate_dealer_phone(
  p_whatsapp  text default null,
  p_alternate text default null
)
returns table (
  source         text,   -- 'field' | 'profile'
  id             uuid,
  name           text,
  matched_number text,
  extra          text,   -- who added it / dealer code, for context
  match_type     text,   -- 'rejected' | 'existing'
  created_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_w     text := nullif(trim(coalesce(p_whatsapp, '')), '');
  v_a     text := nullif(trim(coalesce(p_alternate, '')), '');
begin
  if not exists (select 1 from public.staff_profiles sp where sp.id = v_uid) then
    return;
  end if;

  if v_w is null and v_a is null then
    return;
  end if;

  return query
    select
      'field'::text,
      dfa.id,
      dfa.shop_name,
      case
        when dfa.whatsapp_number in (v_w, v_a) then dfa.whatsapp_number
        else dfa.alternate_number
      end,
      'added by ' || coalesce(sp.name, dfa.added_by_email),
      case when dfa.status = 'rejected' then 'rejected' else 'existing' end,
      dfa.created_at
    from public.dealer_field_adds dfa
    left join public.staff_profiles sp on sp.email = dfa.added_by_email
    where (v_w is not null and (dfa.whatsapp_number = v_w or dfa.alternate_number = v_w))
       or (v_a is not null and (dfa.whatsapp_number = v_a or dfa.alternate_number = v_a))

    union all

    select
      'profile'::text,
      p.id,
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name),
      p.phone,
      coalesce(p.dealer_code, 'dealer'),
      'existing'::text,
      p.created_at
    from public.profiles p
    where p.deleted_at is null
      and p.phone is not null
      and ((v_w is not null and p.phone = v_w) or (v_a is not null and p.phone = v_a));
end;
$$;

grant execute on function public.check_duplicate_dealer_phone(text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. get_grantable_staff() — who a Senior can pick from, for a given
--    dealer's "+ Grant access" multi-select. Server re-validates the
--    caller's own tier + access every time (R4 — never trust the client).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_grantable_staff(p_dealer_id uuid)
returns table (email text, name text, role text)
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
  from public.staff_profiles sp where sp.id = v_uid;

  if v_email is null or v_role not in ('senior_sales_associate', 'senior_sales_executive') then
    return;
  end if;

  if not public._dealer_has_ledger_access(p_dealer_id, v_email, v_role) then
    return;
  end if;

  if v_role = 'senior_sales_executive' then
    -- R4 — full override: any active Sales staff member (except self).
    return query
      select sp.email, sp.name, sp.role
      from public.staff_profiles sp
      where sp.department = 'Sales' and sp.is_active and sp.email <> v_email
      order by sp.name;
  else
    -- R4 — Senior Sales Associate: only staff who report to them.
    return query
      select sp.email, sp.name, sp.role
      from public.staff_profiles sp
      where sp.reports_to = v_email and sp.is_active
      order by sp.name;
  end if;
end;
$$;

grant execute on function public.get_grantable_staff(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. grant_dealer_access() — R4, multi-grantee in one call. Every
--    eligibility check re-runs server-side; the client's list of emails
--    is never trusted as-is.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.grant_dealer_access(
  p_dealer_id       uuid,
  p_grantee_emails  text[]
)
returns table (success boolean, message text, granted_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_role  text;
  v_dealer_name text;
  v_ge    text;
  v_eligible int;
  v_granted int := 0;
begin
  select sp.email, sp.role into v_email, v_role
  from public.staff_profiles sp where sp.id = v_uid;

  if v_email is null then
    return query select false, 'not authenticated as staff'::text, 0; return;
  end if;

  if v_role not in ('senior_sales_associate', 'senior_sales_executive') then
    return query select false, 'you do not have permission to grant access'::text, 0; return;
  end if;

  if not public._dealer_has_ledger_access(p_dealer_id, v_email, v_role) then
    return query select false, 'you do not have ledger access to this dealer yourself'::text, 0; return;
  end if;

  if p_grantee_emails is null or array_length(p_grantee_emails, 1) is null then
    return query select false, 'pick at least one person'::text, 0; return;
  end if;

  select coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name)
  into v_dealer_name
  from public.profiles p where p.id = p_dealer_id;

  foreach v_ge in array p_grantee_emails loop
    if v_role = 'senior_sales_executive' then
      select count(*) into v_eligible from public.staff_profiles sp
        where sp.email = v_ge and sp.department = 'Sales' and sp.is_active and sp.email <> v_email;
    else
      select count(*) into v_eligible from public.staff_profiles sp
        where sp.email = v_ge and sp.reports_to = v_email and sp.is_active;
    end if;

    if v_eligible = 0 then
      continue; -- silently skip anyone who isn't actually eligible for this granter
    end if;

    insert into public.dealer_access_grants (dealer_id, grantee_email, granted_by)
    values (p_dealer_id, v_ge, v_email)
    on conflict (dealer_id, grantee_email)
    do update set granted_by = excluded.granted_by, granted_at = now(), revoked_at = null, revoked_by = null;

    insert into public.staff_notifications (recipient_email, kind, title, body, dealer_id)
    values (
      v_ge,
      'ledger_access_granted',
      'You''ve been given ledger access',
      coalesce(v_email, 'Someone') || ' granted you access to ' || coalesce(v_dealer_name, 'a dealer') || '''s ledger.',
      p_dealer_id
    );

    v_granted := v_granted + 1;
  end loop;

  if v_granted = 0 then
    return query select false, 'none of the selected people are eligible for this grant'::text, 0; return;
  end if;

  return query select true, format('access granted to %s %s', v_granted, case when v_granted = 1 then 'person' else 'people' end)::text, v_granted;
end;
$$;

grant execute on function public.grant_dealer_access(uuid, text[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. revoke_dealer_access() — R4: only whoever granted it, or anyone
--     senior enough to have granted it themselves.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.revoke_dealer_access(
  p_dealer_id     uuid,
  p_grantee_email text
)
returns table (success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_role  text;
  v_grant record;
begin
  select sp.email, sp.role into v_email, v_role
  from public.staff_profiles sp where sp.id = v_uid;

  if v_email is null then
    return query select false, 'not authenticated as staff'::text; return;
  end if;

  if v_role not in ('senior_sales_associate', 'senior_sales_executive') then
    return query select false, 'you do not have permission to revoke access'::text; return;
  end if;

  select * into v_grant from public.dealer_access_grants g
    where g.dealer_id = p_dealer_id and g.grantee_email = p_grantee_email and g.revoked_at is null;

  if not found then
    return query select false, 'no active grant found'::text; return;
  end if;

  if v_role = 'senior_sales_associate' and v_grant.granted_by <> v_email then
    return query select false, 'you can only revoke access you yourself granted'::text; return;
  end if;

  update public.dealer_access_grants
  set revoked_at = now(), revoked_by = v_email
  where dealer_id = p_dealer_id and grantee_email = p_grantee_email and revoked_at is null;

  return query select true, 'access revoked'::text;
end;
$$;

grant execute on function public.revoke_dealer_access(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 11. get_my_team_access() — powers the new Team & Access screen.
--     Senior tiers only — every dealer the caller currently has ledger
--     access to (own + team's + anything granted to them), with the
--     current grantee list for each.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_my_team_access()
returns table (
  dealer_id     uuid,
  dealer_name   text,
  dealer_code   text,
  outstanding   numeric,
  owner_email   text,
  owner_name    text,
  is_owner      boolean,
  grants        jsonb
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
  from public.staff_profiles sp where sp.id = v_uid;

  if v_email is null or v_role not in ('senior_sales_associate', 'senior_sales_executive') then
    return;
  end if;

  return query
    select
      p.id as dealer_id,
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name) as dealer_name,
      p.dealer_code as dealer_code,
      coalesce(led.balance, 0) as outstanding,
      p.assigned_sales_rep as owner_email,
      coalesce(osp.name, p.assigned_sales_rep) as owner_name,
      (p.assigned_sales_rep = v_email) as is_owner,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'email', g.grantee_email,
          'name', coalesce(gsp.name, g.grantee_email),
          'granted_by', g.granted_by,
          'granted_by_name', coalesce(bsp.name, g.granted_by),
          'granted_at', g.granted_at
        ) order by g.granted_at)
        from public.dealer_access_grants g
        left join public.staff_profiles gsp on gsp.email = g.grantee_email
        left join public.staff_profiles bsp on bsp.email = g.granted_by
        where g.dealer_id = p.id and g.revoked_at is null
      ), '[]'::jsonb) as grants
    from public.profiles p
    left join public.staff_profiles osp on osp.email = p.assigned_sales_rep
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
      and public._dealer_has_ledger_access(p.id, v_email, v_role)
    order by dealer_name;
end;
$$;

grant execute on function public.get_my_team_access() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 12. Notifications — in-app half of the "in app alert plus notification
--     on email" decision (§5.4 of the design doc). Email half is a
--     separate follow-up (needs a new Resend edge function).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_my_notifications(p_limit int default 30)
returns table (
  id          uuid,
  kind        text,
  title       text,
  body        text,
  dealer_id   uuid,
  dealer_name text,
  created_at  timestamptz,
  read_at     timestamptz
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
      n.id, n.kind, n.title, n.body, n.dealer_id,
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name),
      n.created_at, n.read_at
    from public.staff_notifications n
    left join public.profiles p on p.id = n.dealer_id
    where n.recipient_email = v_email
    order by n.created_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_my_notifications(int) to authenticated;

create or replace function public.mark_notification_read(p_id uuid)
returns table (success boolean)
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
    return query select false; return;
  end if;

  update public.staff_notifications
  set read_at = now()
  where id = p_id and recipient_email = v_email and read_at is null;

  return query select true;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns table (success boolean)
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
    return query select false; return;
  end if;

  update public.staff_notifications
  set read_at = now()
  where recipient_email = v_email and read_at is null;

  return query select true;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;
