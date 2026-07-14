-- Hisaab automation — Telegram bot → structured bookkeeping tables.
--
-- ISOLATION: Hisaab is a separate business from Eltop by Embassy. This schema must stay
-- completely inaccessible to dealer/customer/staff roles used elsewhere in this Supabase
-- project. It intentionally does NOT reuse public.is_admin() / public.admins — that surface
-- covers every Eltop admin, which is a broader group than is authorized to see Hisaab data.
-- Instead it defines its own hisaab_admins table + is_hisaab_admin() helper, checked by every
-- policy below. The only other access path is the service_role key, used exclusively by the
-- telegram-webhook edge function (never shared with any dealer-facing route/RPC/function).

-- ---------- HISAAB ADMINS (separate authorization surface — not public.admins) ----------
create table if not exists public.hisaab_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.hisaab_admins enable row level security;

-- Mirrors the public.admins pattern in supabase/schema.sql (schema.sql:146-148): membership is
-- only readable by the row's own owner, and is managed manually via SQL Editor, not the app —
-- no insert/update/delete policy is exposed here on purpose.
create policy "Hisaab admins can view their own row"
  on public.hisaab_admins for select
  using (auth.uid() = id);

create or replace function public.is_hisaab_admin()
returns boolean as $$
  select exists (select 1 from public.hisaab_admins where id = auth.uid());
$$ language sql security definer stable;

-- Run once Sumaksh has an auth.users row (i.e. has signed in at least once via this project's
-- Supabase Auth). Safe to run before that too — it just inserts nothing until a matching email
-- exists. Re-run any time to (re)grant access, or add other emails the same way.
insert into public.hisaab_admins (id, email)
select id, email from auth.users where email = 'msumaksh@gmail.com'
on conflict (id) do nothing;

-- ---------- VENDORS ----------
create table if not exists public.hisaab_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.hisaab_vendors enable row level security;

create policy "Hisaab admins can view hisaab vendors"
  on public.hisaab_vendors for select
  using (public.is_hisaab_admin());

create policy "Hisaab admins can insert hisaab vendors"
  on public.hisaab_vendors for insert
  with check (public.is_hisaab_admin());

create policy "Hisaab admins can update hisaab vendors"
  on public.hisaab_vendors for update
  using (public.is_hisaab_admin());

create policy "Hisaab admins can delete hisaab vendors"
  on public.hisaab_vendors for delete
  using (public.is_hisaab_admin());

-- Fuzzy vendor-name matching (trigram similarity), used by the edge function so
-- "Sheetal ashok fan blade" and "sheetal Ashok Fan Blade" collapse to one vendor row.
create extension if not exists pg_trgm;

create index if not exists hisaab_vendors_name_trgm_idx
  on public.hisaab_vendors using gin (name gin_trgm_ops);

-- Not security definer — runs with the caller's privileges, so it stays subject to the
-- hisaab_vendors RLS policies above (a non-hisaab-admin caller sees no rows, gets no match).
create or replace function public.match_hisaab_vendor(input_name text, threshold real default 0.35)
returns uuid as $$
  select id
  from public.hisaab_vendors
  where similarity(lower(name), lower(input_name)) > threshold
  order by similarity(lower(name), lower(input_name)) desc
  limit 1;
$$ language sql stable;

-- ---------- ENTRIES ----------
create table if not exists public.hisaab_entries (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null,
  telegram_chat_title text,
  telegram_message_id bigint,
  telegram_from_name text,
  vendor_id uuid references public.hisaab_vendors(id),
  vendor_raw text,
  entry_type text not null default 'unknown' check (entry_type in ('payment','purchase','unknown')),
  direction text check (direction in ('paid','received')),
  amount numeric,
  mode text,
  entry_date date,
  entry_date_raw text,
  confidence text check (confidence in ('high','medium','low')),
  notes text,
  raw_input_text text,
  photo_storage_path text,
  created_at timestamptz not null default now()
);

alter table public.hisaab_entries enable row level security;

create policy "Hisaab admins can view hisaab entries"
  on public.hisaab_entries for select
  using (public.is_hisaab_admin());

create policy "Hisaab admins can insert hisaab entries"
  on public.hisaab_entries for insert
  with check (public.is_hisaab_admin());

create policy "Hisaab admins can update hisaab entries"
  on public.hisaab_entries for update
  using (public.is_hisaab_admin());

create policy "Hisaab admins can delete hisaab entries"
  on public.hisaab_entries for delete
  using (public.is_hisaab_admin());

create index if not exists hisaab_entries_vendor_id_idx on public.hisaab_entries (vendor_id);
create index if not exists hisaab_entries_entry_date_idx on public.hisaab_entries (entry_date);
create index if not exists hisaab_entries_telegram_chat_id_idx on public.hisaab_entries (telegram_chat_id);

-- ---------- ITEMS ----------
create table if not exists public.hisaab_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.hisaab_entries(id) on delete cascade,
  description text,
  quantity numeric,
  unit text,
  rate numeric
);

alter table public.hisaab_items enable row level security;

create policy "Hisaab admins can view hisaab items"
  on public.hisaab_items for select
  using (public.is_hisaab_admin());

create policy "Hisaab admins can insert hisaab items"
  on public.hisaab_items for insert
  with check (public.is_hisaab_admin());

create policy "Hisaab admins can update hisaab items"
  on public.hisaab_items for update
  using (public.is_hisaab_admin());

create policy "Hisaab admins can delete hisaab items"
  on public.hisaab_items for delete
  using (public.is_hisaab_admin());

-- ---------- STORAGE (slip photos, private — financial records, own bucket) ----------
insert into storage.buckets (id, name, public)
values ('hisaab-slips', 'hisaab-slips', false)
on conflict (id) do nothing;

create policy "Hisaab admins can view hisaab slips"
  on storage.objects for select
  using (bucket_id = 'hisaab-slips' and public.is_hisaab_admin());

create policy "Hisaab admins can upload hisaab slips"
  on storage.objects for insert
  with check (bucket_id = 'hisaab-slips' and public.is_hisaab_admin());

create policy "Hisaab admins can delete hisaab slips"
  on storage.objects for delete
  using (bucket_id = 'hisaab-slips' and public.is_hisaab_admin());
