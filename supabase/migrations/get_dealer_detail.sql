-- get_dealer_detail.sql
--
-- Powers a dealer detail screen for Sales staff: contact info, credit/
-- discount terms, and recent order history — so a rep can pull up
-- everything they need before or during a call with a dealer, without
-- leaving the Sales dashboard.
--
-- SECURITY DEFINER, same pattern as get_my_dealers() and
-- claim_staff_profile(): reuses the exact same role-based visibility
-- rules as get_my_dealers() (own dealers / own + direct reports' /
-- whole Sales department) so a rep can't view a dealer outside their
-- own scope just by knowing its id — every call is re-checked here,
-- not just filtered in the list.
--
-- Run in Supabase SQL Editor.

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
  outstanding   numeric
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
    return; -- not a recognized staff member
  end if;

  -- Same scoping as get_my_dealers(): confirm this dealer is actually
  -- within the caller's own visibility before returning anything.
  select exists (
    select 1 from public.profiles p
    where p.id = p_dealer_id
      and p.deleted_at is null
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
  ) into v_allowed;

  if not v_allowed then
    return; -- outside this rep's scope; return nothing rather than error
  end if;

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
      p.credit_limit,
      p.discount1,
      p.discount2,
      coalesce(led.balance, 0) as outstanding
    from public.profiles p
    left join (
      select dealer_id,
        sum(case
              when type = 'order' or (type = 'journal' and dr_dealer) then amount
              when type = 'payment' or type = 'credit_note' or (type = 'journal' and cr_dealer) then -amount
              else 0
            end) as balance
      from public.dealer_ledger
      where dealer_id = p_dealer_id
      group by dealer_id
    ) led on led.dealer_id = p.id
    where p.id = p_dealer_id;
end;
$$;

grant execute on function public.get_dealer_detail(uuid) to authenticated;

-- get_dealer_orders(): recent order history for the same dealer, same
-- scope check, kept as a separate function so the detail screen can
-- load contact/credit info and order history independently.
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
                select email from public.staff_profiles where reports_to = v_email
              )
            ))
        or (v_role = 'senior_sales_executive' and p.assigned_sales_rep in (
              select email from public.staff_profiles where department = 'Sales'
            ))
      )
  ) into v_allowed;

  if not v_allowed then
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
