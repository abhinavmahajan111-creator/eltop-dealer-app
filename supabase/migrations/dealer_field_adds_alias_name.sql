-- dealer_field_adds_alias_name.sql
--
-- Follow-up to dealer_field_adds.sql. Requested 10 Sept 2026: reps often
-- know a shop by "owner surname + area" (e.g. "Sharma Shahdra", "Verma
-- Bhajanpura") rather than its exact signboard name, and this is also
-- exactly what disambiguates two different shops that both got typed in
-- as "Sharma Electric". Adds an optional Alias field to the field-add
-- form, shown in brackets next to the shop name wherever a field-added
-- dealer is listed, and included in the rep's own dealer search.
--
-- Run in Supabase SQL Editor.

-- ── 1. New column ─────────────────────────────────────────────────────

alter table public.dealer_field_adds
  add column if not exists alias_name text;

-- ── 2. add_field_dealer() — new optional p_alias_name param ─────────────
-- Param list changed, so the old signature must be dropped first.

drop function if exists public.add_field_dealer(text, text, text, text, text, double precision, double precision);

create or replace function public.add_field_dealer(
  p_shop_name        text,
  p_owner_name       text,
  p_alias_name       text,
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
    shop_name, owner_name, alias_name, whatsapp_number, alternate_number, address,
    location_lat, location_lng, added_by_email
  )
  values (
    trim(p_shop_name), nullif(trim(coalesce(p_owner_name, '')), ''),
    nullif(trim(coalesce(p_alias_name, '')), ''),
    trim(p_whatsapp_number), nullif(trim(coalesce(p_alternate_number, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    p_latitude, p_longitude, v_email
  )
  returning id into v_new_id;

  return query select true, 'added'::text, v_new_id;
end;
$$;

grant execute on function public.add_field_dealer(text, text, text, text, text, text, double precision, double precision) to authenticated;

-- ── 3. get_my_dealers() — surface alias_name for field-added rows ───────
-- New output column, so the old signature must be dropped first.

drop function if exists public.get_my_dealers();

create or replace function public.get_my_dealers()
returns table (
  id          uuid,
  name        text,
  dealer_code text,
  territory   jsonb,
  outstanding numeric,
  dealer_kind text,  -- 'profile' | 'field_pending' | 'field_approved'
  alias_name  text
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
        'profile'::text as dealer_kind,
        null::text as alias_name
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
        ('field_' || dfa.status)::text as dealer_kind,
        dfa.alias_name
      from public.dealer_field_adds dfa
      where dfa.added_by_email = v_email and dfa.status <> 'rejected'
    ) combined
    order by name;
end;
$$;

grant execute on function public.get_my_dealers() to authenticated;

-- ── 4. admin_list_field_dealers() — surface alias_name too ──────────────

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
