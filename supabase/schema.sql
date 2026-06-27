-- Eltop Dealer App — Supabase schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).

-- ---------- PROFILES (dealers) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'New Dealer',
  dealer_code text unique,
  phone text,
  gstin text,
  address text,
  credit_limit numeric not null default 500000,
  outstanding numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Dealers can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Dealers can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up (e.g. via phone OTP)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, phone, dealer_code)
  values (
    new.id,
    new.phone,
    'ETP-DLR-' || lpad((floor(random() * 9999))::text, 4, '0')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- PRODUCTS ----------
create table if not exists public.products (
  id bigint primary key,
  name text not null,
  sku text unique not null,
  category text not null,
  price numeric not null,
  mrp numeric not null,
  stock int not null default 0,
  image_url text,
  warehouse_delhi int not null default 0,
  warehouse_ludhiana int not null default 0,
  warehouse_jaipur int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Anyone authenticated can read products"
  on public.products for select
  using (auth.role() = 'authenticated');

-- ---------- ORDERS ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','confirmed','dispatched','out_for_delivery','delivered')),
  subtotal numeric not null,
  tax numeric not null,
  total numeric not null,
  delivery_address text,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Dealers can view their own orders"
  on public.orders for select
  using (auth.uid() = dealer_id);

create policy "Dealers can create their own orders"
  on public.orders for insert
  with check (auth.uid() = dealer_id);

-- ---------- ORDER ITEMS ----------
create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id),
  name text not null,
  price numeric not null,
  qty int not null
);

alter table public.order_items enable row level security;

create policy "Dealers can view items of their own orders"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.dealer_id = auth.uid()
    )
  );

create policy "Dealers can add items to their own orders"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.dealer_id = auth.uid()
    )
  );

-- ---------- INVOICES ----------
create table if not exists public.invoices (
  id bigint generated always as identity primary key,
  dealer_id uuid not null references public.profiles(id) on delete cascade,
  invoice_no text unique not null,
  invoice_date date not null,
  amount numeric not null,
  status text not null default 'due' check (status in ('due','paid')),
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;

create policy "Dealers can view their own invoices"
  on public.invoices for select
  using (auth.uid() = dealer_id);
