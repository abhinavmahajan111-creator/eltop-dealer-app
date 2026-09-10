-- dealer_field_adds_dual_phone.sql
--
-- Follow-up to dealer_field_adds.sql. Requested 9 Sept 2026: a field-added
-- dealer's phone was a single optional field, and there was no duplicate
-- detection at all — a rep in a hurry could (and does) log the same shop
-- more than once under slightly different spellings ("Sharma electric" /
-- "Sharma electricals" / "Sharma enterprises"). Sumaksh's decision:
--   - Collect TWO numbers: WhatsApp number (mandatory) and an Alternate
--     number (optional).
--   - The moment either number matches a number already on file — on
--     another field-added dealer OR a real onboarded dealer's profile —
--     surface that as a duplicate suggestion right away (not blocking;
--     genuinely different shops can share a family/office number).
--   - This is a phone match only, nothing to do with login — dealer login
--     is by email OTP (public.profiles has no auth relationship to
--     phone). profiles.phone is just contact info, same as here.
--
-- Run in Supabase SQL Editor.

-- ── 1. Split the old single `phone` column into two ─────────────────────

alter table public.dealer_field_adds
  rename column phone to whatsapp_number;

alter table public.dealer_field_adds
  add column if not exists alternate_number text;

-- ── 2. check_duplicate_dealer_phone() — live "does this number already
--       exist?" lookup, called by the client as the rep types a number.
--       Checks both dealer_field_adds (any status) and real profiles.
--       Purely informational — never blocks anything.

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
  -- Any authenticated staff member may check (reps need this live, not
  -- just admins).
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
      'added by ' || coalesce(sp.name, dfa.added_by_email) ||
        case when dfa.status = 'rejected' then ' (rejected)' else '' end,
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
      p.created_at
    from public.profiles p
    where p.deleted_at is null
      and p.phone is not null
      and ((v_w is not null and p.phone = v_w) or (v_a is not null and p.phone = v_a));
end;
$$;

grant execute on function public.check_duplicate_dealer_phone(text, text) to authenticated;

-- ── 3. add_field_dealer() — dual phone params, WhatsApp mandatory ───────
-- Param list changed (5 args -> 6 args), so the old signature must be
-- dropped before recreating.

drop function if exists public.add_field_dealer(text, text, text, text, double precision, double precision);

create or replace function public.add_field_dealer(
  p_shop_name        text,
  p_owner_name       text,
  p_whatsapp_number  text,
  p_alternate_number text,
  p_address          text,
  p_latitude         double precision,
  p_longitude        double precision
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

  if p_whatsapp_number is null or length(trim(p_whatsapp_number)) = 0 then
    return query select false, 'WhatsApp number is required'::text, null::uuid;
    return;
  end if;

  if p_latitude is null or p_longitude is null then
    return query select false, 'location is required to add a new dealer'::text, null::uuid;
    return;
  end if;

  insert into public.dealer_field_adds (
    shop_name, owner_name, whatsapp_number, alternate_number, address,
    location_lat, location_lng, added_by_email
  )
  values (
    trim(p_shop_name), nullif(trim(coalesce(p_owner_name, '')), ''),
    trim(p_whatsapp_number), nullif(trim(coalesce(p_alternate_number, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    p_latitude, p_longitude, v_email
  )
  returning id into v_new_id;

  return query select true, 'added'::text, v_new_id;
end;
$$;

grant execute on function public.add_field_dealer(text, text, text, text, text, double precision, double precision) to authenticated;

-- ── 4. admin_list_field_dealers() — surface both numbers ────────────────
-- Return columns changed (phone -> whatsapp_number, alternate_number), so
-- the old signature's return type must be dropped before recreating.

drop function if exists public.admin_list_field_dealers(text);

create or replace function public.admin_list_field_dealers(p_status text default 'pending')
returns table (
  id                 uuid,
  shop_name          text,
  owner_name         text,
  whatsapp_number    text,
  alternate_number   text,
  address            text,
  location_lat       double precision,
  location_lng       double precision,
  added_by_email     text,
  added_by_name      text,
  status             text,
  reviewed_by        text,
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz
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
      dfa.id, dfa.shop_name, dfa.owner_name, dfa.whatsapp_number, dfa.alternate_number, dfa.address,
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
