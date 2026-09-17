-- ═══════════════════════════════════════════════════════════════════════
-- Dealer onboarding: self-service document upload
-- ═══════════════════════════════════════════════════════════════════════
-- Lets a pending dealer (dealer_application_status = 'pending_details' or
-- 'rejected') submit their own identity documents and shop photos/videos
-- from the app, instead of an admin having to enter everything by hand in
-- AdminDealers.jsx. Reuses the existing owner_photo / staff1_photo /
-- shop_board_photo / shop_video columns (already admin-writable — see
-- dealer_profile_expanded.sql) so those admin screens automatically show
-- whatever the dealer uploads; only adds the columns that didn't already
-- exist for this flow.

alter table public.profiles
  add column if not exists doc_aadhaar           text,
  add column if not exists doc_pan               text,
  add column if not exists doc_gst_cert           text,
  add column if not exists shop_outside_photo     text,
  add column if not exists intro_video            text,
  add column if not exists documents_submitted_at timestamptz;

-- ── dealer-documents bucket: Aadhaar / PAN / GST certificate ──────────
-- Private (not public, unlike dealer-media/staff-media) — these are
-- sensitive identity documents, not shop photos. Only the owning dealer
-- or an admin can read or write; viewing requires a signed URL, never a
-- public one (see getDealerDocumentUrl() in src/utils/dealerDocuments.js).
insert into storage.buckets (id, name, public)
  values ('dealer-documents', 'dealer-documents', false)
  on conflict (id) do nothing;

drop policy if exists "Dealer can view own documents or admin any" on storage.objects;
create policy "Dealer can view own documents or admin any"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'dealer-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "Dealer can upload own documents or admin any" on storage.objects;
create policy "Dealer can upload own documents or admin any"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dealer-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "Dealer can replace own documents or admin any" on storage.objects;
create policy "Dealer can replace own documents or admin any"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dealer-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ── dealer-media bucket: dealer can now also write to their own folder ──
-- Previously admin-only (see "Admins can upload dealer media" in
-- dealer_profile_expanded.sql). Adds the self-upload path for owner/
-- staff/shop photos + the two onboarding videos, alongside that existing
-- admin-can-upload-any policy — both insert and update, mirroring the
-- staff-media pattern (upsert:true needs both to replace an object).
drop policy if exists "Dealer can upload own media" on storage.objects;
create policy "Dealer can upload own media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dealer-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Dealer can replace own media" on storage.objects;
create policy "Dealer can replace own media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dealer-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Self-service field writer ──────────────────────────────────────────
-- Narrow, whitelisted RPC (not a blanket "dealer can edit own profile
-- row" policy) — same defense-in-depth reasoning as update_my_photo() in
-- dealer_access_control.sql: a dealer must not be able to touch
-- is_dealer, credit_limit, dealer_application_status, etc. through this
-- path, only the specific onboarding fields below. Blocked once the
-- application is already approved, so an approved dealer can't quietly
-- swap out their submitted documents afterward.
create or replace function public.update_my_dealer_field(p_field text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_dealer = true
      and coalesce(dealer_application_status, '') <> 'approved'
  ) then
    raise exception 'Not allowed: no editable dealer application for this account.';
  end if;

  case p_field
    when 'registration_type' then
      if p_value not in ('Registered', 'Unregistered') then
        raise exception 'Invalid registration_type.';
      end if;
      update public.profiles set registration_type = p_value where id = auth.uid();
    when 'gstin'              then update public.profiles set gstin              = p_value where id = auth.uid();
    when 'owner_photo'        then update public.profiles set owner_photo        = p_value where id = auth.uid();
    when 'staff1_photo'       then update public.profiles set staff1_photo       = p_value where id = auth.uid();
    when 'shop_outside_photo' then update public.profiles set shop_outside_photo = p_value where id = auth.uid();
    when 'shop_board_photo'   then update public.profiles set shop_board_photo   = p_value where id = auth.uid();
    when 'shop_video'         then update public.profiles set shop_video         = p_value where id = auth.uid();
    when 'intro_video'        then update public.profiles set intro_video        = p_value where id = auth.uid();
    when 'doc_aadhaar'        then update public.profiles set doc_aadhaar        = p_value where id = auth.uid();
    when 'doc_pan'            then update public.profiles set doc_pan            = p_value where id = auth.uid();
    when 'doc_gst_cert'       then update public.profiles set doc_gst_cert       = p_value where id = auth.uid();
    else raise exception 'Unknown field: %', p_field;
  end case;
end;
$$;

grant execute on function public.update_my_dealer_field(text, text) to authenticated;

-- ── Submit application: server-side completeness check + status flip ──
-- Mirrors missingApplicationItems() in AdminDealers.jsx/DealerCRM.jsx —
-- keep both in sync if the required document set ever changes.
create or replace function public.submit_dealer_application()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  missing text[] := '{}';
begin
  select * into p from public.profiles where id = auth.uid();

  if p.id is null or p.is_dealer is not true then
    raise exception 'Not allowed: this account is not a dealer application.';
  end if;
  if coalesce(p.dealer_application_status, '') = 'approved' then
    raise exception 'This application is already approved.';
  end if;

  if p.doc_aadhaar         is null then missing := missing || 'Aadhaar'; end if;
  if p.doc_pan             is null then missing := missing || 'PAN'; end if;
  if p.owner_photo         is null then missing := missing || 'Owner photo'; end if;
  if p.staff1_photo        is null then missing := missing || 'Staff photo'; end if;
  if p.shop_outside_photo  is null then missing := missing || 'Shop outside photo'; end if;
  if p.shop_board_photo    is null then missing := missing || 'Shop board photo'; end if;
  if p.shop_video          is null then missing := missing || 'Shop inside video'; end if;
  if p.intro_video         is null then missing := missing || 'Intro video'; end if;
  if p.registration_type = 'Registered' then
    if p.doc_gst_cert is null           then missing := missing || 'GST certificate'; end if;
    if p.gstin is null or p.gstin = '' then missing := missing || 'GSTIN'; end if;
  end if;

  if array_length(missing, 1) > 0 then
    raise exception 'Missing: %', array_to_string(missing, ', ');
  end if;

  update public.profiles
    set documents_submitted_at = now(),
        dealer_application_status = 'under_review'
    where id = auth.uid();
end;
$$;

grant execute on function public.submit_dealer_application() to authenticated;
