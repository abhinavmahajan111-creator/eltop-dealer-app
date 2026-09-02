-- sales_dealer_assignment_fix.sql
--
-- Fixes two accuracy bugs found during live testing of get_my_dealers()
-- (see sales_dealer_assignment.sql for the original function):
--
-- 1. "Total outstanding" was reading profiles.outstanding directly, but
--    that column isn't kept in sync with real activity — AdminDealers'
--    own "Credit Used" figure is computed LIVE from dealer_ledger (sum of
--    order/journal-dr minus payment/credit_note/journal-cr), never from
--    that stored column. A dealer who genuinely owed money showed ₹0.
--    Fixed by computing the same live ledger balance here.
--
-- 2. Dealer names showed the generic legacy `profiles.name` column
--    (default 'New Dealer', often blank for older rows) instead of the
--    actual business name Admin enters as shop_name/alias_name.
--
-- Only replaces the function — no table/column changes, safe to re-run.
-- Run in Supabase SQL Editor.

create or replace function public.get_my_dealers()
returns table (
  id          uuid,
  name        text,
  dealer_code text,
  territory   jsonb,
  outstanding numeric
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
    return; -- not a recognized staff member; nothing to return
  end if;

  return query
    select
      p.id,
      coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name) as name,
      p.dealer_code,
      to_jsonb(p.territory) as territory,
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
    order by coalesce(nullif(p.shop_name, ''), nullif(p.alias_name, ''), p.name);
end;
$$;

grant execute on function public.get_my_dealers() to authenticated;
