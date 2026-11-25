-- Phase 0 foundation: enums, tables, triggers, RLS, views, RPC stubs, storage, reference seed.
-- Financial writes stay in later phases; the functions here reject with not_implemented after the role check.
-- account_provisions.created_by is nullable only while no profile exists, so the first Super Admin can be provisioned.

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable: %', sqlerrm;
  end;
end $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- Enums
create type public.app_role as enum ('admin', 'sales');
create type public.account_status as enum ('active', 'inactive');
create type public.product_type as enum ('single', 'set');
create type public.product_status as enum ('available', 'reserved', 'partially_sold', 'sold', 'inactive');
create type public.commission_type as enum ('percentage', 'fixed');
create type public.commission_status as enum ('pending', 'approved', 'paid', 'cancelled');
create type public.commission_kind as enum ('earning', 'clawback');
create type public.sale_status as enum ('completed', 'cancelled');
create type public.payment_kind as enum ('payment', 'refund');
create type public.reservation_status as enum ('active', 'expired', 'cancelled', 'converted');
create type public.reservation_reason as enum ('manual', 'price_request');
create type public.price_request_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'used');
create type public.bonus_type as enum ('percentage', 'fixed');
create type public.delivery_status as enum ('pending', 'scheduled', 'delivered', 'pickup');
create type public.sale_item_status as enum ('active', 'cancelled');
create type public.audit_visibility as enum ('operational', 'restricted');
create type public.media_kind as enum ('image', 'video');

-- Identity
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  email public.citext not null unique,
  full_name text,
  status public.account_status not null default 'active',
  must_change_password boolean not null default false,
  is_super_admin boolean not null default false,
  profile_completed boolean not null default false,
  created_by uuid references public.profiles (id),
  deactivated_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_super_admin on public.profiles (is_super_admin) where is_super_admin;

create table public.user_roles (
  user_id uuid primary key references public.profiles (id) on delete restrict,
  role public.app_role not null,
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now()
);

create table public.employee_private_data (
  user_id uuid primary key references public.profiles (id) on delete restrict,
  phone text not null check (phone ~ '^(\+20|0)1[0125][0-9]{8}$'),
  address text not null check (length(address) between 5 and 500),
  national_id_encrypted text not null,
  national_id_hash text not null unique,
  national_id_masked text not null,
  updated_at timestamptz not null default now()
);

create table public.account_provisions (
  email public.citext primary key,
  role public.app_role not null,
  must_change_password boolean not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

-- Catalog
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  store_code text not null unique check (store_code ~ '^[A-Z]{2,4}$'),
  address text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  slug text not null unique,
  parent_id uuid references public.categories (id) on delete restrict,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.product_seq;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  seq_no bigint not null unique default nextval('public.product_seq'),
  code text not null unique,
  public_code text not null unique,
  name text not null,
  description text,
  category_id uuid not null references public.categories (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  product_type public.product_type not null default 'single',
  allow_piece_sale boolean not null default false,
  status public.product_status not null default 'inactive',
  list_price numeric(12, 2) not null check (list_price > 0),
  min_price numeric(12, 2) check (min_price is null or (min_price > 0 and min_price <= list_price)),
  commission_type public.commission_type not null default 'percentage',
  commission_value numeric(12, 2) not null default 0 check (commission_value >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (commission_type <> 'percentage' or commission_value <= 100),
  check (product_type = 'set' or allow_piece_sale = false)
);
alter sequence public.product_seq owned by public.products.seq_no;

create index products_status_idx on public.products (status);
create index products_store_idx on public.products (store_id);
create index products_category_idx on public.products (category_id);
create index products_price_idx on public.products (list_price);
create index products_name_trgm on public.products using gin (name gin_trgm_ops);
create index products_code_trgm on public.products using gin (code gin_trgm_ops);

create table public.product_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  suffix char(1) not null check (suffix ~ '^[A-Z]$'),
  name text not null,
  status public.product_status not null default 'available' check (status in ('available', 'reserved', 'sold', 'inactive')),
  list_price numeric(12, 2) not null check (list_price > 0),
  min_price numeric(12, 2) check (min_price is null or (min_price > 0 and min_price <= list_price)),
  commission_type public.commission_type not null,
  commission_value numeric(12, 2) not null check (commission_value >= 0),
  unique (product_id, suffix),
  check (commission_type <> 'percentage' or commission_value <= 100)
);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  kind public.media_kind not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds numeric(8, 2),
  poster_path text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (kind = 'image' or is_primary = false),
  check (
    kind = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp')
    or kind = 'video' and mime_type in ('video/mp4', 'video/webm', 'video/quicktime')
  ),
  check (
    kind = 'image' and size_bytes <= 5242880
    or kind = 'video' and size_bytes <= 52428800
  )
);
create unique index one_primary_media on public.product_media (product_id) where is_primary;
create index product_media_product on public.product_media (product_id, sort_order);

-- Reservations and price requests
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  component_id uuid references public.product_components (id) on delete restrict,
  user_id uuid not null references public.profiles (id),
  reason public.reservation_reason not null default 'manual',
  status public.reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index one_active_reservation_product on public.reservations (product_id) where status = 'active' and component_id is null;
create unique index one_active_reservation_component on public.reservations (component_id) where status = 'active' and component_id is not null;
create index reservations_user_status on public.reservations (user_id, status);
create index reservations_active_expiry on public.reservations (expires_at) where status = 'active';

create table public.price_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  component_id uuid references public.product_components (id) on delete restrict,
  requested_by uuid not null references public.profiles (id),
  requested_price numeric(12, 2) not null check (requested_price > 0),
  note text,
  status public.price_request_status not null default 'pending',
  approved_price numeric(12, 2),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

-- Sales
create sequence public.invoice_seq;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  seller_id uuid not null references public.profiles (id),
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null,
  customer_address text,
  notes text,
  payment_method text not null,
  delivery_status public.delivery_status not null default 'pending',
  delivery_date date,
  delivery_address text,
  delivery_notes text,
  delivered_at timestamptz,
  installments_need_review boolean not null default false,
  total_list_price numeric(12, 2) not null,
  total_price numeric(12, 2) not null check (total_price >= 0),
  status public.sale_status not null default 'completed',
  sold_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancel_reason text,
  check (status = 'completed' or (cancel_reason is not null and cancelled_by is not null))
);
create index sales_seller_idx on public.sales (seller_id, sold_at desc);
create index sales_sold_at_idx on public.sales (sold_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  component_id uuid references public.product_components (id) on delete restrict,
  store_id uuid not null references public.stores (id),
  category_id uuid not null references public.categories (id),
  list_price numeric(12, 2) not null,
  sale_price numeric(12, 2) not null check (sale_price > 0),
  status public.sale_item_status not null default 'active',
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancel_reason text,
  is_live boolean not null default true,
  check (status = 'active' or (cancel_reason is not null and cancelled_by is not null and is_live = false))
);
create unique index sale_items_live_product on public.sale_items (product_id) where is_live and component_id is null;
create unique index sale_items_live_component on public.sale_items (component_id) where is_live and component_id is not null;
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

-- Commissions
create table public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  paid_at date not null,
  method text not null,
  note text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  sale_item_id uuid not null references public.sale_items (id) on delete restrict,
  user_id uuid not null references public.profiles (id),
  kind public.commission_kind not null default 'earning',
  status public.commission_status not null default 'pending',
  base_type public.commission_type,
  base_value numeric(12, 2),
  base_amount numeric(12, 2) not null default 0,
  bonus_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null,
  original_commission_id uuid references public.commissions (id),
  payment_id uuid references public.commission_payments (id) on delete restrict,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  approval_override_reason text,
  created_at timestamptz not null default now(),
  check ((kind = 'earning' and total_amount >= 0) or (kind = 'clawback' and total_amount < 0 and original_commission_id is not null)),
  check ((status = 'paid') = (payment_id is not null))
);
create unique index one_earning_per_item on public.commissions (sale_item_id) where kind = 'earning';
create unique index one_clawback_per_original on public.commissions (original_commission_id) where kind = 'clawback';
create index commissions_user_status on public.commissions (user_id, status);
create index commissions_sale_idx on public.commissions (sale_id);
create index commissions_payment_idx on public.commissions (payment_id);

create table public.commission_bonuses (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions (id) on delete restrict,
  bonus_rule_id uuid,
  rule_name text not null,
  bonus_type public.bonus_type not null,
  bonus_value numeric(12, 2) not null,
  amount numeric(12, 2) not null check (amount >= 0)
);

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  filters jsonb not null,
  new_type public.commission_type not null,
  new_value numeric(12, 2) not null,
  affected_count int not null,
  undone_at timestamptz,
  undone_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.commission_rule_items (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.commission_rules (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  component_id uuid references public.product_components (id) on delete restrict,
  old_type public.commission_type not null,
  old_value numeric(12, 2) not null
);

create table public.bonus_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bonus_type public.bonus_type not null,
  bonus_value numeric(12, 2) not null check (bonus_value > 0),
  price_min numeric(12, 2),
  price_max numeric(12, 2),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_max is null or price_min is null or price_max >= price_min),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (bonus_type <> 'percentage' or bonus_value <= 100)
);
create index bonus_rules_active_idx on public.bonus_rules (is_active);

create table public.bonus_rule_products (
  rule_id uuid references public.bonus_rules (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  primary key (rule_id, product_id)
);
create table public.bonus_rule_categories (
  rule_id uuid references public.bonus_rules (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  primary key (rule_id, category_id)
);
create table public.bonus_rule_stores (
  rule_id uuid references public.bonus_rules (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  primary key (rule_id, store_id)
);

alter table public.commission_bonuses
  add constraint commission_bonuses_rule_fk foreign key (bonus_rule_id) references public.bonus_rules (id) on delete set null;

-- Payments
create sequence public.receipt_seq;

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  kind public.payment_kind not null default 'payment',
  amount numeric(12, 2) not null check (amount > 0),
  paid_at date not null,
  method text not null,
  note text,
  reason text,
  receipt_no text not null unique,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (kind = 'payment' or reason is not null)
);
create index sale_payments_sale_idx on public.sale_payments (sale_id, created_at);

create table public.sale_installments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  seq int not null check (seq >= 0),
  due_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  superseded_at timestamptz
);
create unique index sale_installments_active_seq on public.sale_installments (sale_id, seq) where superseded_at is null;
create index sale_installments_due_idx on public.sale_installments (sale_id, due_date);

-- Notifications, settings, audit
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread on public.notifications (user_id, created_at desc) where read_at is null;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  super_admin_only boolean not null default false,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  reason text,
  ip_address inet,
  visibility public.audit_visibility not null default 'operational',
  created_at timestamptz not null default now()
);
create index audit_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_created_idx on public.audit_logs (created_at desc);
revoke update, delete, truncate on public.audit_logs from public, anon, authenticated, service_role;
