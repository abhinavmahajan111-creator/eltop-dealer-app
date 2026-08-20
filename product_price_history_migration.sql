-- Auto-logs every change to products.price / mrp / dlp with old value, new value,
-- who changed it, and when. Solves "what was this price before I changed it"
-- without needing PITR, log digging, or seed-file archaeology.

create table if not exists public.product_price_history (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.admins(id),
  changed_by_email text,
  old_price numeric,
  new_price numeric,
  old_mrp numeric,
  new_mrp numeric,
  old_dlp numeric,
  new_dlp numeric
);

create index if not exists idx_product_price_history_product_id
  on public.product_price_history (product_id, changed_at desc);

alter table public.product_price_history enable row level security;

-- Only admins can read history. Nobody gets direct insert/update/delete access —
-- the SECURITY DEFINER trigger function below is the only writer.
create policy "Admins can read price history"
  on public.product_price_history for select
  using (public.is_admin());

create or replace function public.log_product_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email text;
begin
  if (new.price is distinct from old.price)
     or (new.mrp is distinct from old.mrp)
     or (new.dlp is distinct from old.dlp) then

    select email into admin_email from public.admins where id = auth.uid();

    insert into public.product_price_history (
      product_id, changed_by, changed_by_email,
      old_price, new_price, old_mrp, new_mrp, old_dlp, new_dlp
    ) values (
      old.id, auth.uid(), admin_email,
      old.price, new.price, old.mrp, new.mrp, old.dlp, new.dlp
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_product_price_change on public.products;
create trigger trg_log_product_price_change
  after update on public.products
  for each row
  execute function public.log_product_price_change();
