-- Expanded dealer profile columns
alter table profiles
  add column if not exists owner_name       text,
  add column if not exists shop_name        text,
  add column if not exists registration_type text default 'unregistered',
  add column if not exists phone2           text,
  add column if not exists shop_address     text,
  add column if not exists godown_address   text,
  add column if not exists website          text,
  add column if not exists territories      text[],
  add column if not exists location_lat     double precision,
  add column if not exists location_lng     double precision,
  add column if not exists staff_assigned   text,
  add column if not exists name_staff1      text,
  add column if not exists name_staff2      text,
  add column if not exists photo_owner      text,
  add column if not exists photo_staff1     text,
  add column if not exists photo_staff2     text,
  add column if not exists photo_shop_inside text,
  add column if not exists photo_shop_board  text,
  add column if not exists video_shop_interior text;

-- Supabase Storage bucket for dealer media (run once)
-- If using Supabase dashboard: create bucket named "dealer-media" and set it to public.
-- If running via SQL (requires storage schema):
insert into storage.buckets (id, name, public)
  values ('dealer-media', 'dealer-media', true)
  on conflict (id) do nothing;

-- Allow authenticated admins to upload
create policy if not exists "Admins can upload dealer media"
  on storage.objects for insert
  with check (bucket_id = 'dealer-media' and public.is_admin());

create policy if not exists "Public can view dealer media"
  on storage.objects for select
  using (bucket_id = 'dealer-media');
