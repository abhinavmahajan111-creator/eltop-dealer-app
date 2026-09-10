-- dealer_field_adds_registration_location.sql
--
-- Follow-up to dealer_field_adds.sql. Requested 10 Sept 2026 (referencing
-- a competitor field-sales app's Customers table): capture whether a
-- newly field-added shop is GST-registered or not, and make the location
-- capture visible in the add-dealer form with an explicit caution that the
-- rep must actually be standing at the shop — not just a silent background
-- GPS grab.
--
-- Run in Supabase SQL Editor.

-- ── 1. New column — GST registration status, optional ───────────────────

alter table public.dealer_field_adds
  add column if not exists registration_type text
  check (registration_type in ('registered', 'unregistered'));

-- ── 2. add_field_dealer() — new optional p_registration_type param ──────
-- Param list changed, so the old signature must be dropped first.

drop function if exists public.add_field_dealer(text, text, text, text, text, text, double precision, double precision);

create or replace function public.add_field_dealer(
  p_shop_name         text,
  p_owner_name        text,
  p_alias_name        text,
  p_whatsapp_number   text,
  p_alternate_number  text,
  p_address           text,
  p_registration_type text,
  p_latitude          double precision,
  p_longitude         double precision
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
  v_reg   text;
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

  v_reg := nullif(trim(coalesce(p_registration_type, '')), '');
  if v_reg is not null and v_reg not in ('registered', 'unregistered') then
    return query select false, 'registration type must be registered or unregistered'::text, null::uuid;
    return;
  end if;

  insert into public.dealer_field_adds (
    shop_name, owner_name, alias_name, whatsapp_number, alternate_number, address,
    registration_type, location_lat, location_lng, added_by_email
  )
  values (
    trim(p_shop_name), nullif(trim(coalesce(p_owner_name, '')), ''),
    nullif(trim(coalesce(p_alias_name, '')), ''),
    trim(p_whatsapp_number), nullif(trim(coalesce(p_alternate_number, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    v_reg, p_latitude, p_longitude, v_email
  )
  returning id into v_new_id;

  return query select true, 'added'::text, v_new_id;
end;
$$;

grant execute on function public.add_field_dealer(text, text, text, text, text, text, text, double precision, double precision) to authenticated;

-- ── 3. admin_list_field_dealers() — surface registration_type too ───────

drop function if exists public.admin_list_field_dealers(text);

create or replace function public.admin_list_field_dealers(p_status text default 'pending')
returns table (
  id                 uuid,
  shop_name          text,
  owner_name         text,
  alias_name         text,
  whatsapp_number    text,
  alternate_number   text,
  address            text,
  registration_type  text,
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
      dfa.id, dfa.shop_name, dfa.owner_name, dfa.alias_name, dfa.whatsapp_number, dfa.alternate_number, dfa.address,
      dfa.registration_type,
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
