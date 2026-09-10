-- get_field_dealer_detail.sql
--
-- New screen requested 10 Sept 2026: tapping a field-added dealer from
-- "My Dealers" or "My Visits" was sending the rep straight to the
-- Check-In tab with no way to see what they'd actually entered — owner
-- name, phone numbers, address, registration type, or their past visits
-- there. This RPC backs a lightweight detail screen (not the full
-- DealerDetail CRM, which needs real ledger/order data this record
-- doesn't have) that shows exactly that.
--
-- Run in Supabase SQL Editor.

create or replace function public.get_field_dealer_detail(p_id uuid)
returns table (
  id                 uuid,
  shop_name          text,
  alias_name         text,
  owner_name         text,
  whatsapp_number    text,
  alternate_number   text,
  address            text,
  registration_type  text,
  status             text,
  location_lat       double precision,
  location_lng       double precision,
  added_by_email     text,
  added_by_name      text,
  created_at         timestamptz
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
      dfa.id, dfa.shop_name, dfa.alias_name, dfa.owner_name,
      dfa.whatsapp_number, dfa.alternate_number, dfa.address,
      dfa.registration_type, dfa.status,
      dfa.location_lat, dfa.location_lng,
      dfa.added_by_email, coalesce(sp2.name, dfa.added_by_email),
      dfa.created_at
    from public.dealer_field_adds dfa
    left join public.staff_profiles sp2 on sp2.email = dfa.added_by_email
    where dfa.id = p_id
      and (dfa.added_by_email = v_email or public.is_admin());
end;
$$;

grant execute on function public.get_field_dealer_detail(uuid) to authenticated;
