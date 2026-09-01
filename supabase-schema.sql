-- ============================================================
--  Pop & Go — Supabase Database Schema
--  Paste this WHOLE file into the Supabase SQL Editor and run it.
--  Safe to re-run: uses "if not exists" / "or replace" everywhere.
-- ============================================================

-- ---------- Extensions ----------
-- This just switches on a small built-in Postgres add-on called "pgcrypto".
-- We only use one function from it: gen_random_uuid(), which generates the
-- long random ID (like a serial number) used as the primary key for every
-- row we create — products, orders, etc. Nothing else about your data is
-- affected by this line; it's a one-time "turn on this feature" switch.
create extension if not exists "pgcrypto";

-- ---------- A note on customer accounts ----------
-- Pop & Go does NOT require customers to register or log in to order.
-- Checkout (see record_sale() below) works for guests: it just stores the
-- name/email typed into the checkout form as plain text on the order row.
-- The `profiles` table below only ever gets a row when someone signs up
-- through Supabase Auth — which, on this site, is meant to be the six team
-- members only (via register.html, which isn't linked from the public
-- pages). See INSTRUCTIONS.md section 3 for how to turn a signed-up
-- account into an admin.

-- ============================================================
-- 1. PROFILES  (one row per auth user — admins only, in practice.
--    Customers order as guests and never get a row here — see the
--    note above.)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  created_at  timestamptz not null default now()
);

-- Whenever someone signs up through Supabase Auth (register.html), this
-- trigger automatically creates their matching row in `profiles`, starting
-- them off with role = 'customer' by default (safest default — nobody is
-- an admin until you explicitly promote them with the SQL command in
-- INSTRUCTIONS.md section 3).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. PRODUCTS
-- ============================================================
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  flavour      text not null default '',
  description  text default '',
  image_url    text default '',
  cost_price   numeric(10,2) not null default 0,   -- what it costs Pop & Go to make (admin-only)
  sell_price   numeric(10,2) not null default 0,   -- what the customer pays
  active       boolean not null default true,
  popular      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- 3. INVENTORY ITEMS (ingredients / packaging / machine consumables)
-- ============================================================
create table if not exists public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  unit          text not null default 'unit',
  stock         numeric(10,2) not null default 0,
  min_level     numeric(10,2) not null default 0,
  per_batch     numeric(10,2) not null default 0,  -- amount used per 32-bag batch
  purchase_cost numeric(10,2) not null default 0,
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 4. BUSINESS SETTINGS (cost-plus pricing inputs — admin only)
--    Key/value store so costs (e.g. electricity, transport) can be
--    edited without changing code. These starting values match the
--    Pop & Go Final Report, Section 6: the popcorn machine is treated
--    as a ONE-TIME startup cost (see 'startup_equipment_cost_once'),
--    not a per-batch charge — electricity is a flat monthly figure
--    for the whole "cooking setup," same as it was for the pot.
-- ============================================================
create table if not exists public.business_settings (
  key         text primary key,
  label       text not null,
  value       numeric(10,4) not null default 0,
  unit        text default 'R',
  updated_at  timestamptz not null default now()
);

insert into public.business_settings (key, label, value, unit) values
  ('bags_per_batch',            'Bags produced per batch',            32,     'bags'),
  ('batches_per_trading_day',   'Batches popped per trading day',     1,      'batches'),
  ('trading_days_per_month',    'Trading days per month',             22,     'days'),
  ('electricity_cost_month',    'Electricity (cooking setup) per month', 150.00, 'R'),
  ('mobile_data_cost_month',    'Mobile data & marketing per month',  50.00,  'R'),
  ('transport_cost_month',      'Transport per month',                30.00,  'R'),
  ('gloves_cost_month',         'Disposable gloves & hygiene per month', 80.00, 'R'),
  ('startup_equipment_cost_once', 'Startup equipment cost (one-time, informational only)', 2494.95, 'R')
on conflict (key) do nothing;

-- Migration for databases that already ran an earlier version of this
-- file (safe to re-run either way): replace the old per-batch machine
-- electricity/maintenance model with the report's flat monthly figure.
insert into public.business_settings (key, label, value, unit)
values ('electricity_cost_month', 'Electricity (cooking setup) per month', 150.00, 'R')
on conflict (key) do update set label = excluded.label, unit = excluded.unit;

insert into public.business_settings (key, label, value, unit)
values ('startup_equipment_cost_once', 'Startup equipment cost (one-time, informational only)', 2494.95, 'R')
on conflict (key) do nothing;

delete from public.business_settings
  where key in ('machine_electricity_cost', 'machine_maintenance_cost');

-- ============================================================
-- 5. ORDERS  (one per simulated checkout — guest or logged-in)
-- ============================================================
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text not null unique,             -- human-friendly reference e.g. PG-20260830-0001
  customer_id    uuid references public.profiles (id) on delete set null,
  customer_name  text not null default 'Guest',
  customer_email text,
  status         text not null default 'pending' check (status in ('pending','paid','fulfilled','cancelled')),
  subtotal       numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 6. ORDER ITEMS
-- ============================================================
create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null,
  unit_price   numeric(10,2) not null default 0,
  unit_cost    numeric(10,2) not null default 0,
  quantity     integer not null check (quantity > 0),
  line_total   numeric(10,2) not null default 0
);

-- ============================================================
-- 7. PAYMENTS  (simulated — no real money ever moves)
-- ============================================================
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  method      text not null default 'simulated',
  amount      numeric(10,2) not null default 0,
  status      text not null default 'success' check (status in ('success','failed')),
  reference   text not null,
  paid_at     timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_payments_order on public.payments (order_id);
create index if not exists idx_orders_created on public.orders (created_at);

-- ============================================================
-- 8. Helper: generate a human-friendly order number
-- ============================================================
create sequence if not exists public.order_number_seq;

create or replace function public.next_order_number()
returns text language sql as $$
  select 'PG-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
$$;

-- ============================================================
-- 8b. record_sale() — the ONE function that powers both the
--     customer "simulated payment" checkout AND the admin
--     "record a sale" button.
--
--     Plain-English version of what this does:
--     1. Looks at the list of items in the cart (p_items).
--     2. Creates one row in `orders` for the whole purchase.
--     3. Creates one row in `order_items` per product bought.
--     4. Reduces ingredient stock in `inventory_items` proportionally.
--     5. Marks the order "paid" and logs a `payments` row (simulated).
--     6. Hands back a receipt (order number, total, reference).
--
--     "security definer" means this function runs with the database
--     owner's permissions instead of the permissions of whoever calls
--     it. That's what lets an anonymous, logged-out customer safely
--     trigger writes to orders/order_items/payments/inventory_items —
--     tables they otherwise cannot touch directly (see the RLS
--     policies further down) — because all of that writing happens
--     INSIDE this one controlled function instead of directly from
--     the browser.
--
--     p_items is a JSON array passed in from JavaScript, e.g.:
--     '[{"product_id":"...uuid...","quantity":2}]'::jsonb
-- ============================================================
create or replace function public.record_sale(
  p_items jsonb,
  p_customer_name  text default 'Guest',
  p_customer_email text default null,
  p_customer_id    uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id     uuid;
  v_order_number text;
  v_subtotal     numeric(10,2) := 0;
  v_item         jsonb;
  v_product      public.products%rowtype;
  v_qty          integer;
  v_line_total   numeric(10,2);
  v_bags_per_batch numeric := 32;
  v_batch_fraction numeric;
  v_inv           public.inventory_items%rowtype;
  v_reference     text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in order';
  end if;

  select coalesce(value, 32) into v_bags_per_batch
    from public.business_settings where key = 'bags_per_batch';

  v_order_number := public.next_order_number();

  insert into public.orders (order_number, customer_id, customer_name, customer_email, status, subtotal, total)
  values (v_order_number, p_customer_id, coalesce(p_customer_name, 'Guest'), p_customer_email, 'pending', 0, 0)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
    if not found then
      raise exception 'Unknown product %', (v_item ->> 'product_id');
    end if;

    v_qty := greatest(1, (v_item ->> 'quantity')::integer);
    v_line_total := round(v_product.sell_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (order_id, product_id, product_name, unit_price, unit_cost, quantity, line_total)
    values (v_order_id, v_product.id, v_product.name, v_product.sell_price, v_product.cost_price, v_qty, v_line_total);

    -- deduct ingredients proportional to a batch of `bags_per_batch`
    v_batch_fraction := v_qty::numeric / nullif(v_bags_per_batch, 0);
    for v_inv in select * from public.inventory_items loop
      update public.inventory_items
        set stock = greatest(0, round(stock - (per_batch * v_batch_fraction), 2)),
            updated_at = now()
        where id = v_inv.id;
    end loop;
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal, status = 'paid' where id = v_order_id;

  v_reference := 'SIM-' || upper(substr(md5(random()::text), 1, 10));
  insert into public.payments (order_id, method, amount, status, reference)
  values (v_order_id, 'simulated', v_subtotal, 'success', v_reference);

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_subtotal,
    'reference', v_reference,
    'paid_at', now()
  );
end;
$$;

-- Allow both guests (anon) and logged-in customers to run a simulated checkout
grant execute on function public.record_sale(jsonb, text, text, uuid) to anon, authenticated;

-- ============================================================
-- 9. Row Level Security ("RLS")
--    Plain-English version: by default, once RLS is switched on for a
--    table, EVERYONE is blocked from reading/writing it until a policy
--    explicitly allows it. Each "create policy" below is one specific
--    exception — e.g. "anyone can insert into orders" or "only admins
--    can edit products". This is what stops a random visitor from
--    reading other customers' orders or editing your prices from their
--    browser's dev tools.
-- ============================================================
alter table public.profiles         enable row level security;
alter table public.products         enable row level security;
alter table public.inventory_items  enable row level security;
alter table public.business_settings enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.payments         enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---- profiles ----
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- ---- products: everyone can read ACTIVE products; only admins write ----
drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_active" on public.products
  for select using (active = true or public.is_admin());

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- inventory & business settings: admin only ----
drop policy if exists "inventory_admin_only" on public.inventory_items;
create policy "inventory_admin_only" on public.inventory_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings_admin_only" on public.business_settings;
create policy "settings_admin_only" on public.business_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- orders: anyone can create an order (guest checkout);
--      a customer can see their own orders; admins see everything ----
drop policy if exists "orders_insert_anyone" on public.orders;
create policy "orders_insert_anyone" on public.orders
  for insert with check (true);

drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select using (
    public.is_admin()
    or (customer_id is not null and customer_id = auth.uid())
  );

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update" on public.orders
  for update using (public.is_admin());

drop policy if exists "orders_admin_delete" on public.orders;
create policy "orders_admin_delete" on public.orders
  for delete using (public.is_admin());

-- ---- order_items: follows the parent order's visibility ----
drop policy if exists "order_items_insert_anyone" on public.order_items;
create policy "order_items_insert_anyone" on public.order_items
  for insert with check (true);

drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

drop policy if exists "order_items_admin_write" on public.order_items;
create policy "order_items_admin_write" on public.order_items
  for delete using (public.is_admin());

-- ---- payments: same visibility as orders; anyone can insert (simulated pay) ----
drop policy if exists "payments_insert_anyone" on public.payments;
create policy "payments_insert_anyone" on public.payments
  for insert with check (true);

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

-- ============================================================
-- 10. Seed products & inventory (only if the tables are empty)
--     Costs below use the POPCORN-MACHINE model — see INSTRUCTIONS.md
--     for how these differ from the original pot-based figures.
-- ============================================================
insert into public.products (name, flavour, description, image_url, cost_price, sell_price, active, popular)
select * from (values
  ('Classic Butter',  'Buttery Salted',  'Our signature freshly popped popcorn with real butter and a pinch of salt.', '/images/flavour-butter.png', 3.40, 5.00, true, true),
  ('Golden Caramel',  'Sweet Caramel',   'Crunchy popcorn coated in a glossy homemade caramel glaze.',                '/images/flavour-caramel.png', 3.75, 6.00, true, false),
  ('Cheesy Pop',      'Cheese',          'Savoury cheese-seasoned popcorn for the salty snack lovers.',               '/images/flavour-cheese.png', 3.80, 6.00, true, false),
  ('Sweet & Salt',    'Sweet & Salted',  'The best of both worlds — a sweet and salty flavour combo.',                '/images/flavour-sweet-salt.png', 3.50, 5.50, true, false)
) as v(name, flavour, description, image_url, cost_price, sell_price, active, popular)
where not exists (select 1 from public.products);

insert into public.inventory_items (name, unit, stock, min_level, per_batch, purchase_cost)
select * from (values
  ('Popcorn Kernels', 'g',    1000, 500, 1000, 35.98),
  ('Cooking Oil',     'ml',   2000, 400, 160,  69.99),
  ('White Sugar',     'g',    2500, 600, 400,  56.99),
  ('Salt',             'g',   500,  120, 60,   7.99),
  ('Seasoning',        'g',   200,  100, 80,   25.00),
  ('Popcorn Bags',     'bags',100,  40,  32,   65.00)
) as v(name, unit, stock, min_level, per_batch, purchase_cost)
where not exists (select 1 from public.inventory_items);

-- ============================================================
-- 11. Make yourself an admin (RUN THIS MANUALLY, AFTER YOU SIGN UP)
-- ============================================================
-- 1. Register an account on the website (register.html) using your own email.
-- 2. Then run the line below in the SQL editor, replacing the email:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- That's it — that account can now log into /admin.html.
