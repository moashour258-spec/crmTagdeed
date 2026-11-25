# DATABASE — Supabase PostgreSQL schema, RLS and RPC specification

Rules for every migration (create tables in dependency order exactly as listed in this document; the SQL blocks here were executed successfully on PostgreSQL 16 with stub `auth.users`):
- Files in `supabase/migrations/NNNN_name.sql`, applied with `supabase db push` to `dev` first, then `prod`. **No manual schema edits in the dashboard.**
- All PKs `uuid default gen_random_uuid()`; all tables have `created_at timestamptz default now()`; mutable ones have `updated_at` (trigger).
- Money = `numeric(12,2)` with `CHECK`s. No float. Rounding half-up in SQL (`round(x, 2)`).
- **No `ON DELETE CASCADE` on anything financial.** Use `RESTRICT`.
- RLS **enabled on every table** in `public`. Default deny. Types generated with `supabase gen types typescript`.
- Every `SECURITY DEFINER` function: `SET search_path = ''`, fully-qualified names, `REVOKE ALL ... FROM public, anon`, `GRANT EXECUTE` only to `authenticated`, and starts with `perform private.assert_active_user();`.
- Extensions: `pgcrypto`, `citext`, `pg_trgm`, `pg_cron`.

## 1. Enums

```sql
create type app_role            as enum ('admin','sales');
create type account_status      as enum ('active','inactive');
create type product_type        as enum ('single','set');
create type product_status      as enum ('available','reserved','partially_sold','sold','inactive');
create type commission_type     as enum ('percentage','fixed');
create type commission_status   as enum ('pending','approved','paid','cancelled');
create type commission_kind     as enum ('earning','clawback');
create type sale_status         as enum ('completed','cancelled');
create type payment_kind        as enum ('payment','refund');
create type reservation_status  as enum ('active','expired','cancelled','converted');
create type reservation_reason  as enum ('manual','price_request');
create type price_request_status as enum ('pending','approved','rejected','cancelled','expired','used');
create type bonus_type          as enum ('percentage','fixed');
create type delivery_status     as enum ('pending','scheduled','delivered','pickup');
create type sale_item_status    as enum ('active','cancelled');
create type audit_visibility    as enum ('operational','restricted');
```

## 2. Tables

### 2.1 Identity

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email citext not null unique,
  full_name text,
  status account_status not null default 'active',
  must_change_password boolean not null default false,   -- true after an Admin sets/generates a password
  is_super_admin boolean not null default false,
  profile_completed boolean not null default false,
  created_by uuid references profiles(id),                -- the Admin who provisioned the account
  deactivated_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_super_admin on profiles (is_super_admin) where is_super_admin;

create table user_roles (
  user_id uuid primary key references profiles(id) on delete restrict,
  role app_role not null,
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now()
);
-- trigger: is_super_admin => role must be 'admin'; super admin role/status immutable;
-- cannot deactivate/demote the last active admin.

create table employee_private_data (
  user_id uuid primary key references profiles(id) on delete restrict,
  phone text not null check (phone ~ '^(\+20|0)1[0125][0-9]{8}$'),
  address text not null check (length(address) between 5 and 500),
  national_id_encrypted text not null,       -- AES-256-GCM (iv.tag.ciphertext, base64) done in app server
  national_id_hash text not null unique,     -- HMAC-SHA256 (separate key) for duplicate detection
  national_id_masked text not null,          -- e.g. '29**********34'  (first 2 + last 2) for display
  updated_at timestamptz not null default now()
);

```

**Provisioning (no self sign-up).** Supabase Auth sign-ups are disabled. Server actions (service role, after an Admin/Super Admin check) first insert a row in `account_provisions`, then create the Auth user with `auth.admin.createUser({ email, password, email_confirm: true })` (random / custom password options) or `auth.admin.inviteUserByEmail(email)` (invitation-link option). If the Auth call fails, the provision row is removed. `account_provisions` has RLS enabled and **no policies** (service role / RPC only), so no client can forge one.

```sql
create table account_provisions (
  email citext primary key,
  role app_role not null,
  must_change_password boolean not null,          -- true for random/custom Admin-set passwords; false for invitation links
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
```

`handle_new_user()` trigger on `auth.users` insert: **raises an exception unless an unconsumed `account_provisions` row exists for the new user's email** (blocks any other signup path even if sign-ups get enabled by mistake). Otherwise it creates the `profiles` row (`status='active'`, `must_change_password` and `created_by` copied from the provision) and the `user_roles` row, and sets `consumed_at`. The seeded Super Admin is created by the seed script (service role) with a provision row, then `is_super_admin=true`, `profile_completed=true`, `must_change_password=false`. Admin-vs-Super-Admin rules (a regular Admin cannot create `admin` users) are enforced in the server action **and** re-checked in the RPC that writes the provision.

`private.is_active_user()` returns true only if `profiles.status='active'` **and** `must_change_password=false`. The single RPC allowed while the flag is true is `complete_password_change()` (called by the server action right after `auth.updateUser({ password })` succeeds; it clears the flag and audits `user.password_changed`).

### 2.2 Catalog

```sql
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  store_code text not null unique check (store_code ~ '^[A-Z]{2,4}$'),
  address text, phone text, notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- trigger: store_code immutable once any product references the store.

create table categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  slug text not null unique,
  parent_id uuid references categories(id) on delete restrict,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- trigger: max depth 2 (a category whose parent has a parent is rejected).

create sequence product_seq;

create table products (
  id uuid primary key default gen_random_uuid(),
  seq_no bigint not null unique default nextval('product_seq'),
  code text not null unique,            -- 'GZ-00127' (ADMIN ONLY)
  public_code text not null unique,     -- 'P-00127'
  name text not null,
  description text,
  category_id uuid not null references categories(id) on delete restrict,
  store_id uuid not null references stores(id) on delete restrict,
  product_type product_type not null default 'single',
  allow_piece_sale boolean not null default false,
  status product_status not null default 'inactive',
  list_price numeric(12,2) not null check (list_price > 0),
  min_price numeric(12,2) check (min_price is null or (min_price > 0 and min_price <= list_price)),
  commission_type commission_type not null default 'percentage',
  commission_value numeric(12,2) not null default 0 check (commission_value >= 0),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (commission_type <> 'percentage' or commission_value <= 100),
  check (product_type = 'set' or allow_piece_sale = false)
);
create index products_status_idx   on products (status);
create index products_store_idx    on products (store_id);
create index products_category_idx  on products (category_id);
create index products_price_idx    on products (list_price);
create index products_name_trgm    on products using gin (name gin_trgm_ops);
create index products_code_trgm    on products using gin (code gin_trgm_ops);
-- BEFORE INSERT trigger: code := store_code || '-' || lpad(seq_no::text,5,'0'); public_code := 'P-' || lpad(seq_no::text,5,'0');
-- BEFORE UPDATE trigger: code/public_code/seq_no immutable.
-- trigger: status can become 'available' only if >=1 product_media row with kind='image' exists (videos don't count).

create table product_components (            -- only for sets with allow_piece_sale
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  suffix char(1) not null check (suffix ~ '^[A-Z]$'),
  name text not null,
  status product_status not null default 'available' check (status in ('available','reserved','sold','inactive')),
  list_price numeric(12,2) not null check (list_price > 0),
  min_price numeric(12,2) check (min_price is null or (min_price > 0 and min_price <= list_price)),
  commission_type commission_type not null,
  commission_value numeric(12,2) not null check (commission_value >= 0),
  unique (product_id, suffix)
);
-- full component code = products.code || '-' || suffix ; public = products.public_code || '-' || suffix

create type media_kind as enum ('image','video');

create table product_media (                 -- images AND videos of a product
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  kind media_kind not null,
  storage_path text not null unique,         -- bucket is implied by kind: product-images | product-videos
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds numeric(8,2),             -- videos only (informational)
  poster_path text,                          -- videos only: WebP in product-images bucket
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (kind = 'image' or is_primary = false),                                   -- primary must be an image
  check (kind = 'image' and mime_type in ('image/jpeg','image/png','image/webp')
      or kind = 'video' and mime_type in ('video/mp4','video/webm','video/quicktime')),
  check (kind = 'image' and size_bytes <= 5242880 or kind = 'video' and size_bytes <= 52428800)
);
create unique index one_primary_media on product_media (product_id) where is_primary;
create index product_media_product on product_media (product_id, sort_order);
-- triggers: max 10 images and max 3 videos per product; deleting a row must also delete its Storage objects
-- (done by the server action; a nightly job reports orphaned objects).
```

### 2.3 Reservations & price requests

```sql
create table reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  component_id uuid references product_components(id) on delete restrict,
  user_id uuid not null references profiles(id),
  reason reservation_reason not null default 'manual',
  status reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
-- one active reservation per sellable unit:
create unique index one_active_reservation_product   on reservations (product_id)   where status='active' and component_id is null;
create unique index one_active_reservation_component on reservations (component_id) where status='active' and component_id is not null;

create table price_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  component_id uuid references product_components(id) on delete restrict,
  requested_by uuid not null references profiles(id),
  requested_price numeric(12,2) not null check (requested_price > 0),
  note text,
  status price_request_status not null default 'pending',
  approved_price numeric(12,2),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
```

### 2.4 Sales

```sql
create sequence invoice_seq;

create table sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,                  -- prefix from settings + lpad(nextval('invoice_seq'),6,'0')
  seller_id uuid not null references profiles(id),
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null,
  customer_address text,
  notes text,
  payment_method text not null,                     -- value from settings.payment_methods
  delivery_status delivery_status not null default 'pending',
  delivery_date date,                               -- planned date
  delivery_address text,                            -- defaults to customer_address
  delivery_notes text,
  delivered_at timestamptz,
  installments_need_review boolean not null default false,  -- set when an item cancellation changes total_price
  total_list_price numeric(12,2) not null,          -- sum of ACTIVE items' list prices (maintained by RPCs)
  total_price numeric(12,2) not null check (total_price >= 0),   -- sum of ACTIVE items' sale prices; 0 only when the sale is cancelled
  status sale_status not null default 'completed',
  sold_at timestamptz not null default now(),
  cancelled_by uuid references profiles(id),
  cancelled_at timestamptz,
  cancel_reason text,
  check (status = 'completed' or (cancel_reason is not null and cancelled_by is not null))
);
create index sales_seller_idx on sales (seller_id, sold_at desc);
create index sales_sold_at_idx on sales (sold_at desc);

create table sale_items (                           -- 1 to 10 items per sale (basket); enforced in complete_sale + trigger
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  component_id uuid references product_components(id) on delete restrict,
  store_id uuid not null references stores(id),     -- snapshot (ADMIN ONLY)
  category_id uuid not null references categories(id),
  list_price numeric(12,2) not null,
  sale_price numeric(12,2) not null check (sale_price > 0),
  status sale_item_status not null default 'active',
  cancelled_by uuid references profiles(id), cancelled_at timestamptz, cancel_reason text,
  is_live boolean not null default true,            -- false when the item is cancelled; releases the unit
  check (status = 'active' or (cancel_reason is not null and cancelled_by is not null and is_live = false))
);
-- a sellable unit (product, or component) can be live in at most one sale:
create unique index sale_items_live_product   on sale_items (product_id)   where is_live and component_id is null;
create unique index sale_items_live_component on sale_items (component_id) where is_live and component_id is not null;
```

A sale's `sale_price` per item lives in `sale_items`; `sales.total_price` is always `sum(sale_items.sale_price) where status='active'` (updated only by the RPCs; a trigger re-checks it). The sale `status` becomes `cancelled` when its last active item is cancelled. Payment status, installments and invoice all work on `sales.total_price`.

`complete_sale` still takes row locks first; the partial unique indexes are the last line of defence against double sales. `cancel_sale` sets `is_live = false`.

### 2.5 Commissions, bonuses, payouts

```sql
create table commission_payments (              -- payouts to employees
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  paid_at date not null,
  method text not null,
  note text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table commissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete restrict,
  sale_item_id uuid not null references sale_items(id) on delete restrict,
  user_id uuid not null references profiles(id),
  kind commission_kind not null default 'earning',
  status commission_status not null default 'pending',
  base_type commission_type,                      -- snapshot
  base_value numeric(12,2),                       -- snapshot (rate or fixed)
  base_amount numeric(12,2) not null default 0,
  bonus_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null,            -- = base + bonus ; negative for clawback
  original_commission_id uuid references commissions(id),  -- for clawback
  payment_id uuid references commission_payments(id) on delete restrict,
  approved_by uuid references profiles(id), approved_at timestamptz,
  approval_override_reason text,                  -- set when approved before full customer payment
  created_at timestamptz not null default now(),
  check ((kind = 'earning' and total_amount >= 0) or (kind = 'clawback' and total_amount < 0 and original_commission_id is not null)),
  check ((status = 'paid') = (payment_id is not null))
);
create unique index one_earning_per_item on commissions (sale_item_id) where kind='earning';
create unique index one_clawback_per_original on commissions (original_commission_id) where kind='clawback';
create index commissions_user_status on commissions (user_id, status);

create table commission_bonuses (                 -- snapshot of every applied bonus rule
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references commissions(id) on delete restrict,
  bonus_rule_id uuid,                              -- FK added below, after bonus_rules exists
  rule_name text not null,
  bonus_type bonus_type not null,
  bonus_value numeric(12,2) not null,
  amount numeric(12,2) not null check (amount >= 0)
);
```

### 2.6 Rules (commission batches + bonus rules)

```sql
create table commission_rules (                   -- LOG of bulk updates (not a live rule engine)
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id),
  filters jsonb not null,
  new_type commission_type not null,
  new_value numeric(12,2) not null,
  affected_count int not null,
  undone_at timestamptz, undone_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table commission_rule_items (
  rule_id uuid not null references commission_rules(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  component_id uuid references product_components(id) on delete restrict,
  old_type commission_type not null, old_value numeric(12,2) not null
);

create table bonus_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bonus_type bonus_type not null,
  bonus_value numeric(12,2) not null check (bonus_value > 0),
  price_min numeric(12,2), price_max numeric(12,2),
  starts_at timestamptz, ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (price_max is null or price_min is null or price_max >= price_min),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (bonus_type <> 'percentage' or bonus_value <= 100)
);
create table bonus_rule_products   (rule_id uuid references bonus_rules(id) on delete cascade, product_id uuid references products(id) on delete cascade, primary key(rule_id, product_id));
create table bonus_rule_categories (rule_id uuid references bonus_rules(id) on delete cascade, category_id uuid references categories(id) on delete cascade, primary key(rule_id, category_id));
create table bonus_rule_stores     (rule_id uuid references bonus_rules(id) on delete cascade, store_id uuid references stores(id) on delete cascade, primary key(rule_id, store_id));
alter table commission_bonuses
  add constraint commission_bonuses_rule_fk foreign key (bonus_rule_id) references bonus_rules(id) on delete set null;
-- (cascade is acceptable ONLY on these scope junctions; they hold no financial history — snapshots live in commission_bonuses)
```

**Bonus matching (function `private.applicable_bonus_rules(product, component, sale_price, at)`)**: rule is active, `at` within `[starts_at, ends_at]` (nulls open), price within `[price_min, price_max]`, and for each scope dimension that has rows → the product's product/category (incl. parent)/store must be in it. At least one scope dimension or a price bound must exist (validated on write).

**Earnings calculation (`private.calc_earnings(product, component, sale_price, at)`)** returns `(base_type, base_value, base_amount, bonus_lines jsonb, bonus_amount, total)`:
1. base = percentage → `round(sale_price * value/100, 2)`; fixed → `least(value, sale_price)`.
2. each matching bonus: percentage → `round(sale_price*value/100,2)`; fixed → value.
3. bonus_amount = sum; apply caps from settings (`bonus_cap_amount`, `bonus_cap_percent_of_price`; stricter wins; scale lines proportionally and record capped amounts).
4. total = base + bonus.

### 2.7 Customer payments & installments

```sql
create sequence receipt_seq;

create table sale_payments (                     -- APPEND-ONLY
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete restrict,
  kind payment_kind not null default 'payment',
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null,                          -- must be <= today (Africa/Cairo): enforced in record_sale_payment (CHECK cannot use now())
  method text not null,
  note text,
  reason text,                                   -- required when kind='refund'
  receipt_no text not null unique,               -- prefix + lpad(nextval('receipt_seq'),6,'0')
  recorded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  check (kind = 'payment' or reason is not null)
);

create table sale_installments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete restrict,
  seq int not null check (seq >= 0),             -- 0 = down payment (due on sale date)
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  superseded_at timestamptz                      -- set on reschedule; old row kept for history
);
create unique index sale_installments_active_seq on sale_installments (sale_id, seq) where superseded_at is null;
```

Views (security definer, filtered by role, see section 4):
- `sale_payment_summary` → per sale: `net_paid = sum(payment) - sum(refund)`, `balance = total_price - net_paid`, `payment_status` (`unpaid` if 0, `paid` if balance = 0, else `partial`).
- `installment_status` → for non-superseded rows ordered by `seq`: allocate `net_paid` FIFO; status `paid` | `partial` | `overdue` (due_date < today and not fully covered) | `upcoming`.

### 2.8 Notifications, settings, audit

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null, title text not null, body text,
  entity_type text, entity_id uuid,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user_unread on notifications (user_id, created_at desc) where read_at is null;

create table app_settings (
  key text primary key,
  value jsonb not null,
  super_admin_only boolean not null default false,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
-- seed: reservation_hours=48, max_active_reservations=5, default_commission_type="percentage", default_commission_value=0,
--       bonus_cap_amount=null (SA only), bonus_cap_percent_of_price=null (SA only),
--       company_name="تجديد", company_address, company_phone, company_footer="شكراً لثقتكم في تجديد", receipt_prefix="RC", invoice_prefix="INV",
--       payment_methods=["كاش","تحويل","تقسيط"]

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity_type text not null, entity_id uuid,
  old_values jsonb, new_values jsonb,
  reason text, ip_address inet,
  visibility audit_visibility not null default 'operational',
  created_at timestamptz not null default now()
);
create index audit_entity_idx on audit_logs (entity_type, entity_id);
create index audit_created_idx on audit_logs (created_at desc);
revoke update, delete, truncate on audit_logs from public, anon, authenticated, service_role;
-- plus a BEFORE UPDATE/DELETE trigger raising an exception (defence in depth).
```

`visibility='restricted'` for: user/role/status changes of Admins, national-ID reveal/edit, security events, bonus-cap/default-commission setting changes. Everything else `operational`.

## 3. Storage

Two **private** buckets, same policies on both: `INSERT/UPDATE/DELETE` only for active admins; no public/anon read; reads only via server-generated signed URLs (1 h).
- `product-images`: MIME image/jpeg, image/png, image/webp; file size limit 5 MB (also stores video posters under `products/{product_id}/posters/`).
- `product-videos`: MIME video/mp4, video/webm, video/quicktime; file size limit **50 MB**.

## 4. RLS & access matrix

Helper functions (in schema `private`, `STABLE SECURITY DEFINER`, used as `(select private.is_active_user())` for performance):
`is_active_user()`, `is_admin()`, `is_super_admin()`, `is_sales()` — all check `profiles.status='active'` and `user_roles`.

| Table / object | Sales | Admin | Super Admin |
|---|---|---|---|
| profiles | own row (select; update only `full_name`) | all select; writes via RPC | all |
| user_roles | own row select | select | all; writes via RPC only |
| employee_private_data | own row select + update phone/address | masked via view; decrypt only via server action | same |
| stores | **no access** | all CRUD (RPC for delete/deactivate rules) | all |
| categories | select active (names only) | CRUD | CRUD |
| products / product_components / product_media | **no direct access** (use catalog views/RPCs) | all | all |
| reservations | own rows | all | all |
| price_requests | own rows (insert via RPC) | all (decide via RPC) | all |
| sales / sale_items | own rows via view **without** store_id | all | all |
| sale_payments / sale_installments | read via views for own sales | all (insert via RPC only) | all |
| commissions / commission_bonuses | own rows | all | all |
| commission_payments | own rows | all (insert via RPC only) | all |
| commission_rules(+items) / bonus_rules(+junctions) | **none** | all | all |
| notifications | own rows (select; update `read_at`) | own | own |
| app_settings | select non-sensitive keys needed by UI (payment_methods, company info) | select all, update via RPC | all |
| audit_logs | none | select `visibility='operational'` | all |

**Writes to financial tables happen only through RPCs** (no INSERT/UPDATE/DELETE policies for `authenticated` on `sales`, `sale_items`, `commissions`, `commission_*`, `sale_payments`, `sale_installments`, `reservations`, `price_requests`, `audit_logs`). Plain CRUD (stores, categories, products, bonus_rules) uses policies restricted to `private.is_admin()`; Super-Admin-only fields guarded in RPC/trigger.

### Sales-facing views / RPCs (never expose `store_id`, store name, `code`, `min_price`)
- `v_catalog` (security definer, `where private.is_sales_or_admin()` ): `public_code, name, description, category_id, category_name, list_price, status(available/partially_sold only), primary_image_path (image only), is_set, est_base_commission, est_bonus, est_total` (computed with `private.calc_earnings(..., list_price, now())`), plus `reserved_by_me boolean` and a masked `is_reserved` flag. Components exposed through `fn_catalog_components(public_code)`. The full gallery (images + videos, ordered, with poster) is exposed through `fn_product_media(public_code)` returning `(kind, storage_path, mime_type, poster_path, duration_seconds, is_primary, sort_order)` only; the server turns paths into signed URLs.
- `v_my_sales` / `v_my_sale_items`: own sales (total, payment status, delivery status) and their items (public code, name, price, status, per-item commission/bonus status); no store/min_price/full code.
- `v_my_commissions`: own commissions with bonus lines.
- `fn_my_dashboard(from, to)`.

## 5. RPC functions (all transactional, audited, role-checked)

| RPC | Role | Steps / guarantees |
|---|---|---|
| `reserve_product(product_id, component_id)` | sales/admin | expire stale reservations; `SELECT … FOR UPDATE` product (+components if set); must be `available`; active-reservation cap; insert reservation; set status `reserved`; broadcast. |
| `cancel_reservation(id)` / `extend_reservation(id, hours)` | owner / admin | restore status; audit. |
| `preview_sale_earnings(items jsonb)` | sales/admin | read-only; items = `[{product_id, component_id, price}]`; same `calc_earnings` per item; validates each price ≥ min_price **without returning min_price** (error names the item only); returns per-item base/bonus lines and totals. |
| `request_price_approval(reservation_id, price, note)` | sales | creates request, keeps hold (`reason=price_request`), notifies admins. |
| `decide_price_request(id, approve, price, note)` | admin | sets `approved_price`; notifies seller. |
| `complete_sale(items jsonb, customer jsonb, payment_method, delivery jsonb)` | sales/admin | 1–10 items, **all-or-nothing**: lock every unit (products, then components, ordered by id) ▸ verify each unit sellable & held by caller (or available) ▸ price rules per item (`>= min_price` or valid per-item `approved_price`) ▸ whole-set sale blocked if `partially_sold` ▸ insert `sales` (one invoice no.), `sale_items` ▸ update product/set statuses ▸ `calc_earnings` per item ▸ insert one `commissions` (pending) + `commission_bonuses` per item ▸ close reservations (`converted`) ▸ audit ▸ notify. |
| `update_sale_customer(sale_id, data)` | seller (while commission pending) / admin | customer fields only; audit old/new. |
| `request_sale_correction(sale_id, note)` | seller | notification to admins. |
| `cancel_sale_item(sale_item_id, reason, restore_status, refund jsonb)` / `cancel_sale(sale_id, reason, restore_status, refund jsonb)` | admin | lock sale + units; item(s) → `cancelled`, `is_live=false`; unit → `available`/`inactive`; set recalculated; that item's commission `pending/approved` → `cancelled` (+ bonuses stay as history), `paid` → one clawback row; recompute `sales.total_price`; if `net_paid > new total` the `refund` param is **required** and recorded as a `refund` payment in the same transaction; set `installments_need_review`; last active item → sale `cancelled`; audit; notify seller. |
| `set_delivery(sale_id, status, date, address, notes)` | admin | updates delivery fields, sets `delivered_at` when `delivered`, audit, notify seller. |
| `delivery_digest()` | pg_cron daily 08:00 Cairo | notify admins about late deliveries; feeds the inbox lists (late / paid-but-undelivered). |
| `record_sale_payment(sale_id, kind, amount, paid_at, method, note, reason)` | admin | lock sale; compute net; enforce `0 <= net <= total`; receipt number; audit. |
| `set_installment_plan(sale_id, rows jsonb)` / `reschedule_installments(sale_id, rows, reason)` | admin | rows sum = `total_price` (active items); supersede old unpaid rows; clear `installments_need_review`; audit. |
| `approve_commissions(ids[], override_reason)` | admin | each: status `pending`, sale not cancelled, sale `paid` or override reason given; audit. |
| `record_commission_payout(user_id, paid_at, method, note)` | admin | lock all that user's `approved` commissions (+ clawbacks) `FOR UPDATE`; net ≥ 0 else error; insert payment; set `payment_id` + `status='paid'`; audit; notify. Double payment impossible (status + unique link). |
| `bulk_update_commission(filters jsonb, ids uuid[], type, value, note)` / `undo_bulk_commission(rule_id)` | admin | log old values; static write; undo only restores unchanged rows. |
| `import_products(rows jsonb, file_name)` | admin | validate all, insert as `inactive`, codes by trigger, one audit entry. |
| `provision_user_audit(user_id, method)`, `set_user_role`, `set_user_status`, `audit_password_action(user_id, action)`, `complete_password_change()` | admin / SA (last one: the user themself) | enforce Admin-vs-Super-Admin rules, last-admin guard; deactivation side effects (cancel reservations, reject price requests); audit; session revocation is done by the server action via service role. |
| `reveal_national_id(user_id)` | admin | server action decrypts; RPC only writes the audit row (`restricted`). |
| `update_setting(key, value)` | admin / SA | SA-only keys guarded; audit old/new. |
| `admin_dashboard_stats(from, to, store_ids[], employee_ids[], category_ids[])` | admin | jsonb of KPIs + series; cancelled sales excluded (shared CTE/view `v_effective_sales`). |
| `expire_reservations()` | pg_cron every 5 min | set `expired`, restore product status, notify 6 h before expiry. |
| `overdue_installments_digest()` | pg_cron daily 08:00 Cairo | notify admins on due date. |

## 6. Realtime
Private Broadcast channel `catalog` via DB trigger (`realtime.broadcast_changes` or `realtime.send`) on product/component/reservation status changes. Payload: `{ public_code, status }` only. `realtime.messages` RLS: active users only. `notifications` table subscribed per user (RLS-filtered).

## 7. Indexes checklist
Per DDL above plus: `sale_items(sale_id)`, `sale_items(product_id)`, `commissions(sale_id)`, `commissions(payment_id)`, `sale_payments(sale_id, created_at)`, `sale_installments(sale_id, due_date)`, `reservations(user_id, status)`, `reservations(expires_at) where status='active'`, `bonus_rules(is_active)`, `product_media(product_id, sort_order)`.

## 8. Seed data (migration `seed_reference`)
Categories (Arabic names, parent/child as in PRD F2), `app_settings` defaults. **No** demo/mock rows. A separate, git-ignored `supabase/seed.dev.sql` may add test users/products for `dev` only.
