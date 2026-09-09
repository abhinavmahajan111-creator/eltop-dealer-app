-- dealer_field_adds_detail_fix.sql
--
-- Follow-up to dealer_field_adds.sql. Found live 9 Sept 2026: tapping a
-- freshly field-added dealer from "My Dealers" (or from "My Visits", for a
-- visit already logged there) sent the rep to DealerDetail.jsx
-- (/staff/sales/dealer/:id) — the full dealer CRM screen (ledger, orders,
-- insights). That screen's own RPC (get_dealer_detail) only ever knew
-- about public.profiles, so it correctly-but-unhelpfully said "This
-- dealer isn't in your assigned list."
--
-- Rather than teach the whole CRM screen (ledger/orders/insights) about a
-- record that has none of that yet — it isn't a real onboarded dealer —
-- the fix is client-side: DealerRow/VisitRow route a field-added dealer
-- to the Check In tab instead, where check-in/checkout already fully
-- works for it. This migration just adds the one bit of information the
-- client needs to make that call: whether a visit's dealer is a
-- field-added one.
--
-- Run in Supabase SQL Editor.

drop function if exists public.get_my_visits(int);

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
  video_url       text,
  is_field_dealer boolean
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
      sv.duty_on_photo_url, sv.board_photo_url, sv.shop_photo_url, sv.card_photo_url, sv.video_url,
      (sv.field_dealer_id is not null)
    from public.sales_visits sv
    left join public.profiles p on p.id = sv.dealer_id
    left join public.dealer_field_adds dfa on dfa.id = sv.field_dealer_id
    where sv.staff_email = v_email
    order by sv.visited_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_my_visits(int) to authenticated;
