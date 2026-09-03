-- dealer_crm_staff.sql
--
-- Backs the rebuilt staff-facing Dealer CRM screen (src/screens/staff/
-- DealerDetail.jsx): Overview / Ledger / Orders / Visits / Insights tabs,
-- approved from mockup/dealer-crm-mockup.html.
--
-- All new functions reuse the exact same rep-scope visibility rule already
-- used by get_dealer_detail/get_dealer_orders/get_dealer_visits (re-derives
-- caller identity from auth.uid() -> staff_profiles, never trusts a
-- client-passed dealer id) — factored into one helper, _staff_dealer_scope_ok,
-- so it isn't duplicated six more times.
--
-- Ageing is deliberately NOT recomputed in SQL: get_dealer_report(...,
-- 'ageing', ...) hands back raw ledger rows and the client runs the one
-- canonical FIFO heuristic in src/lib/ledgerUtils.js (computeAgingFromLedger)
-- on them — same logic AgingReport.jsx and admin DealerCRM.jsx already use,
-- not a second implementation that could drift out of sync.
--
-- Run in Supabase SQL Editor.

create or replace function public._staff_dealer_scope_ok(p_dealer_id uuid)
returns boolean
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
    return false;
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

  return v_allowed;
end;
$$;

grant execute on function public._staff_dealer_scope_ok(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Ledger tab — real voucher rows for a date range. Client computes the
-- running balance forward from an opening balance (get_dealer_balance_asof
-- called with the day before p_from) using isDebitEntry/isCreditEntry from
-- ledgerUtils.js — same helpers the aging calc uses, not reimplemented here.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_dealer_ledger(p_dealer_id uuid, p_from date default null, p_to date default null)
returns table (
  id            uuid,
  type          text,
  voucher_type  text,
  voucher_no    text,
  voucher_date  date,
  created_at    timestamptz,
  narration     text,
  amount        numeric,
  dr_dealer     boolean,
  cr_dealer     boolean,
  method        text,
  reference_no  text,
  reason        text,
  dr_account    text,
  cr_account    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, '2000-01-01'::date);
  v_to   date := coalesce(p_to, current_date);
begin
  if not public._staff_dealer_scope_ok(p_dealer_id) then
    return;
  end if;

  return query
    select
      dl.id, dl.type, dl.voucher_type, dl.voucher_no,
      coalesce(dl.voucher_date, dl.created_at::date) as voucher_date,
      dl.created_at, dl.narration, dl.amount, dl.dr_dealer, dl.cr_dealer,
      dl.method, dl.reference_no, dl.reason, dl.dr_account, dl.cr_account
    from public.dealer_ledger dl
    where dl.dealer_id = p_dealer_id
      and coalesce(dl.voucher_date, dl.created_at::date) between v_from and v_to
    order by coalesce(dl.voucher_date, dl.created_at::date) asc, dl.created_at asc;
end;
$$;

grant execute on function public.get_dealer_ledger(uuid, date, date) to authenticated;

-- Outstanding balance as of a given date (or right now if null) — used for
-- the Ledger tab's Opening Balance line, the Ageing report's "as of" date,
-- and anywhere else a point-in-time balance is needed.
create or replace function public.get_dealer_balance_asof(p_dealer_id uuid, p_asof date default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asof date := coalesce(p_asof, current_date);
  v_balance numeric;
begin
  if not public._staff_dealer_scope_ok(p_dealer_id) then
    return null;
  end if;

  select coalesce(sum(case
        when dl.type = 'order' or (dl.type = 'journal' and dl.dr_dealer) then dl.amount
        when dl.type = 'payment' or dl.type = 'credit_note' or (dl.type = 'journal' and dl.cr_dealer) then -dl.amount
        else 0
      end), 0)
  into v_balance
  from public.dealer_ledger dl
  where dl.dealer_id = p_dealer_id
    and coalesce(dl.voucher_date, dl.created_at::date) <= v_asof;

  return v_balance;
end;
$$;

grant execute on function public.get_dealer_balance_asof(uuid, date) to authenticated;

-- Line items for one order, for the Orders tab's expand-on-tap — scope is
-- checked via the order's own dealer_id rather than trusting a client-sent
-- dealer id alongside the order id.
create or replace function public.get_order_items_for_staff(p_order_id uuid)
returns table (
  name  text,
  qty   int,
  price numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
begin
  select o.dealer_id into v_dealer_id from public.orders o where o.id = p_order_id;
  if v_dealer_id is null or not public._staff_dealer_scope_ok(v_dealer_id) then
    return;
  end if;

  return query
    select oi.name, oi.qty, oi.price
    from public.order_items oi
    where oi.order_id = p_order_id
    order by oi.id;
end;
$$;

grant execute on function public.get_order_items_for_staff(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Insights tab — one RPC, dispatched by report name, each branch computed
-- for the [p_from, p_to] window the client passes for that specific report
-- (each report in the UI has its own independent period picker). Returns
-- jsonb rather than nine separate typed functions to keep this one function
-- signature the client needs to know about.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_dealer_report(
  p_dealer_id uuid,
  p_report    text,
  p_from      date default null,
  p_to        date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, '2000-01-01'::date);
  v_to   date := coalesce(p_to, current_date);
  v_result jsonb;
begin
  if not public._staff_dealer_scope_ok(p_dealer_id) then
    return null;
  end if;

  if p_report = 'order_stats' then
    select jsonb_build_object(
      'total_orders_lifetime', (select count(*) from public.orders o where o.dealer_id = p_dealer_id),
      'orders_pending', (select count(*) from public.orders o where o.dealer_id = p_dealer_id and o.status = 'pending'),
      'orders_in_period', (select count(*) from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to),
      'last_order_value', (select o.total from public.orders o where o.dealer_id = p_dealer_id order by o.created_at desc limit 1),
      'last_order_date', (select o.created_at from public.orders o where o.dealer_id = p_dealer_id order by o.created_at desc limit 1),
      'avg_order_value', (select coalesce(round(avg(o.total)::numeric, 2), 0) from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to)
    ) into v_result;

  elsif p_report = 'top_products' then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
    from (
      select oi.name, sum(oi.qty) as qty, count(distinct oi.order_id) as orders_count, sum(oi.qty * oi.price) as amount
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to
      group by oi.name
      order by sum(oi.qty * oi.price) desc
      limit 10
    ) t;

  elsif p_report = 'sales_trend' then
    select coalesce(jsonb_agg(row_to_json(t) order by t.month_start), '[]'::jsonb) into v_result
    from (
      select
        to_char(m.month_start, 'Mon') as month_label,
        m.month_start,
        coalesce(sum(o.total), 0) as amount
      from generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month') as m(month_start)
      left join public.orders o
        on o.dealer_id = p_dealer_id
        and date_trunc('month', o.created_at) = m.month_start
      group by m.month_start
    ) t;

  elsif p_report = 'payment_collection' then
    select jsonb_build_object(
      'collected', (
        select coalesce(sum(dl.amount), 0) from public.dealer_ledger dl
        where dl.dealer_id = p_dealer_id and dl.type = 'payment'
          and coalesce(dl.voucher_date, dl.created_at::date) between v_from and v_to
      ),
      'still_due', (
        select coalesce(sum(case
              when dl.type = 'order' or (dl.type = 'journal' and dl.dr_dealer) then dl.amount
              when dl.type = 'payment' or dl.type = 'credit_note' or (dl.type = 'journal' and dl.cr_dealer) then -dl.amount
              else 0
            end), 0)
        from public.dealer_ledger dl where dl.dealer_id = p_dealer_id
      )
    ) into v_result;

  elsif p_report = 'ageing' then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
    from (
      select dl.id, dl.type, dl.voucher_type, dl.voucher_no,
             coalesce(dl.voucher_date, dl.created_at::date) as voucher_date,
             dl.created_at, dl.amount, dl.dr_dealer, dl.cr_dealer
      from public.dealer_ledger dl
      where dl.dealer_id = p_dealer_id and coalesce(dl.voucher_date, dl.created_at::date) <= v_to
      order by coalesce(dl.voucher_date, dl.created_at::date)
    ) t;

  elsif p_report = 'gst_summary' then
    select jsonb_build_object(
      'taxable_value', (select coalesce(sum(o.subtotal), 0) from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to),
      'cgst', (select coalesce(sum(o.cgst), 0) from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to),
      'sgst', (select coalesce(sum(o.sgst), 0) from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to),
      'igst', (select coalesce(sum(o.igst), 0) from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to),
      'total_invoice_value', (select coalesce(sum(o.total), 0) from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to)
    ) into v_result;

  elsif p_report = 'order_status' then
    select jsonb_build_object(
      'pending', (select count(*) from public.orders o where o.dealer_id = p_dealer_id and o.status = 'pending' and o.created_at::date between v_from and v_to),
      'confirmed', (select count(*) from public.orders o where o.dealer_id = p_dealer_id and o.status = 'confirmed' and o.created_at::date between v_from and v_to),
      'dispatched', (select count(*) from public.orders o where o.dealer_id = p_dealer_id and o.status in ('dispatched','out_for_delivery') and o.created_at::date between v_from and v_to),
      'delivered', (select count(*) from public.orders o where o.dealer_id = p_dealer_id and o.status = 'delivered' and o.created_at::date between v_from and v_to)
    ) into v_result;

  elsif p_report = 'returns' then
    select jsonb_build_object(
      'count', (select count(*) from public.dealer_ledger dl where dl.dealer_id = p_dealer_id and dl.type = 'credit_note' and coalesce(dl.voucher_date, dl.created_at::date) between v_from and v_to),
      'total_value', (select coalesce(sum(dl.amount), 0) from public.dealer_ledger dl where dl.dealer_id = p_dealer_id and dl.type = 'credit_note' and coalesce(dl.voucher_date, dl.created_at::date) between v_from and v_to),
      'top_reason', (
        select dl.reason from public.dealer_ledger dl
        where dl.dealer_id = p_dealer_id and dl.type = 'credit_note' and dl.reason is not null
          and coalesce(dl.voucher_date, dl.created_at::date) between v_from and v_to
        group by dl.reason order by count(*) desc limit 1
      )
    ) into v_result;

  elsif p_report = 'order_frequency' then
    select jsonb_build_object(
      'avg_days_between_orders', (
        select round(avg(extract(epoch from (o.created_at - prev_at)) / 86400)::numeric, 1)
        from (
          select o.created_at, lag(o.created_at) over (order by o.created_at) as prev_at
          from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to
        ) o
        where prev_at is not null
      ),
      'days_since_last_order', (select floor(extract(epoch from (now() - max(o.created_at))) / 86400) from public.orders o where o.dealer_id = p_dealer_id),
      'active_months', (select count(distinct date_trunc('month', o.created_at)) from public.orders o where o.dealer_id = p_dealer_id and o.created_at::date between v_from and v_to),
      'total_months', greatest(1, (extract(year from age(v_to, v_from)) * 12 + extract(month from age(v_to, v_from)) + 1)::int)
    ) into v_result;

  elsif p_report = 'visit_conversion' then
    with vis as (
      select sv.id, coalesce(sv.check_in_at, sv.visited_at) as visit_time
      from public.sales_visits sv
      where sv.dealer_id = p_dealer_id and coalesce(sv.check_in_at, sv.visited_at)::date between v_from and v_to
    ),
    conv as (
      select v.id from vis v
      where exists (
        select 1 from public.orders o
        where o.dealer_id = p_dealer_id
          and o.created_at between v.visit_time - interval '2 days' and v.visit_time + interval '2 days'
      )
    )
    select jsonb_build_object(
      'visits_count', (select count(*) from vis),
      'converted_count', (select count(*) from conv),
      'conversion_rate', case when (select count(*) from vis) = 0 then 0
        else round((select count(*) from conv)::numeric / (select count(*) from vis) * 100, 0) end
    ) into v_result;

  else
    v_result := jsonb_build_object('error', 'unknown report');
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_dealer_report(uuid, text, date, date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- AI assistant support — bulk ledger rows across every dealer in the
-- caller's own scope (or a specific subset), so the dashboard-level "Ask AI
-- about your dealers" card can run the same computeAgingFromLedger() heuristic
-- per dealer client-side (e.g. "which dealers are 30+ days overdue") without
-- a second FIFO implementation in SQL. Same scope rule as every other
-- dealer-facing RPC, just evaluated per-row via a join instead of a single
-- p_dealer_id check.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_dealers_ledger_rows(p_dealer_ids uuid[] default null)
returns table (
  dealer_id     uuid,
  type          text,
  voucher_date  date,
  created_at    timestamptz,
  amount        numeric,
  dr_dealer     boolean,
  cr_dealer     boolean
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
    select dl.dealer_id, dl.type, coalesce(dl.voucher_date, dl.created_at::date), dl.created_at, dl.amount, dl.dr_dealer, dl.cr_dealer
    from public.dealer_ledger dl
    join public.profiles p on p.id = dl.dealer_id
    where p.deleted_at is null
      and (p_dealer_ids is null or dl.dealer_id = any(p_dealer_ids))
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
    order by dl.dealer_id, coalesce(dl.voucher_date, dl.created_at::date);
end;
$$;

grant execute on function public.get_my_dealers_ledger_rows(uuid[]) to authenticated;
