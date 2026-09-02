-- get_dealer_detail_fix.sql
--
-- Fixes "column reference "email" is ambiguous" on get_dealer_detail().
--
-- Root cause: the function's RETURNS TABLE(...) includes an `email`
-- column, and in PL/pgSQL every RETURNS TABLE column becomes an implicit
-- variable in scope for the whole function body. The scope-check
-- subqueries referenced `email` unqualified (e.g. "select email from
-- staff_profiles where reports_to = ..."), which Postgres couldn't tell
-- apart from that implicit output variable. get_my_dealers() never hit
-- this because its output has no `email` column.
--
-- Fix: every column reference is now qualified with a table alias, so
-- nothing is ambiguous regardless of output column names. Only replaces
-- the function — no table changes, safe to re-run.
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

-- get_dealer_orders() had no `email` output column so it wasn't actually
-- broken, but re-qualifying its scope-check subquery too for consistency
-- and to avoid the same class of bug if this function's shape ever changes.
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
    select o.id, o.status, o.total, o.created_at
    from public.orders o
    where o.dealer_id = p_dealer_id
    order by o.created_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_dealer_orders(uuid, int) to authenticated;
