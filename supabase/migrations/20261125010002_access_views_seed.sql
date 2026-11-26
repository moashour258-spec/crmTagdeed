-- RLS, role-filtered views, RPC stubs, storage, reference data, grants.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.employee_private_data enable row level security;
alter table public.account_provisions enable row level security;
alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_components enable row level security;
alter table public.product_media enable row level security;
alter table public.reservations enable row level security;
alter table public.price_requests enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.commission_payments enable row level security;
alter table public.commissions enable row level security;
alter table public.commission_bonuses enable row level security;
alter table public.commission_rules enable row level security;
alter table public.commission_rule_items enable row level security;
alter table public.bonus_rules enable row level security;
alter table public.bonus_rule_products enable row level security;
alter table public.bonus_rule_categories enable row level security;
alter table public.bonus_rule_stores enable row level security;
alter table public.sale_payments enable row level security;
alter table public.sale_installments enable row level security;
alter table public.notifications enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select
  using (private.is_active_user() and (id = auth.uid() or private.is_admin()));
create policy profiles_update_own on public.profiles for update
  using (private.is_active_user() and id = auth.uid())
  with check (private.is_active_user() and id = auth.uid());

create policy user_roles_select on public.user_roles for select
  using (private.is_active_user() and (user_id = auth.uid() or private.is_admin()));

create policy employee_private_select on public.employee_private_data for select
  using (private.is_active_user() and user_id = auth.uid());
create policy employee_private_update on public.employee_private_data for update
  using (private.is_active_user() and user_id = auth.uid())
  with check (private.is_active_user() and user_id = auth.uid());

create policy stores_admin on public.stores for all
  using (private.is_admin()) with check (private.is_admin());
create policy categories_select on public.categories for select
  using (private.is_admin() or (private.is_sales() and is_active));
create policy categories_admin_write on public.categories for all
  using (private.is_admin()) with check (private.is_admin());

create policy products_admin on public.products for all
  using (private.is_admin()) with check (private.is_admin());
create policy components_admin on public.product_components for all
  using (private.is_admin()) with check (private.is_admin());
create policy media_admin on public.product_media for all
  using (private.is_admin()) with check (private.is_admin());

create policy reservations_select on public.reservations for select
  using (private.is_admin() or (private.is_sales() and user_id = auth.uid()));
create policy price_requests_select on public.price_requests for select
  using (private.is_admin() or (private.is_sales() and requested_by = auth.uid()));

create policy sales_admin_select on public.sales for select using (private.is_admin());
create policy sale_items_admin_select on public.sale_items for select using (private.is_admin());
create policy sale_payments_admin_select on public.sale_payments for select using (private.is_admin());
create policy sale_installments_admin_select on public.sale_installments for select using (private.is_admin());

create policy commissions_select on public.commissions for select
  using (private.is_admin() or (private.is_sales() and user_id = auth.uid()));
create policy commission_bonuses_select on public.commission_bonuses for select
  using (
    private.is_admin()
    or exists (
      select 1 from public.commissions c
      where c.id = commission_id and c.user_id = auth.uid() and private.is_sales()
    )
  );
create policy commission_payments_select on public.commission_payments for select
  using (private.is_admin() or (private.is_sales() and user_id = auth.uid()));

create policy commission_rules_admin on public.commission_rules for all
  using (private.is_admin()) with check (private.is_admin());
create policy commission_rule_items_admin on public.commission_rule_items for all
  using (private.is_admin()) with check (private.is_admin());
create policy bonus_rules_admin on public.bonus_rules for all
  using (private.is_admin()) with check (private.is_admin());
create policy bonus_products_admin on public.bonus_rule_products for all
  using (private.is_admin()) with check (private.is_admin());
create policy bonus_categories_admin on public.bonus_rule_categories for all
  using (private.is_admin()) with check (private.is_admin());
create policy bonus_stores_admin on public.bonus_rule_stores for all
  using (private.is_admin()) with check (private.is_admin());

create policy notifications_select on public.notifications for select
  using (private.is_active_user() and user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (private.is_active_user() and user_id = auth.uid())
  with check (private.is_active_user() and user_id = auth.uid());

create policy settings_select on public.app_settings for select
  using (
    private.is_admin()
    or (
      private.is_sales()
      and key in (
        'payment_methods', 'company_name', 'company_address', 'company_phone',
        'company_footer', 'invoice_prefix', 'receipt_prefix'
      )
    )
  );

create policy audit_select on public.audit_logs for select
  using (
    private.is_super_admin()
    or (private.is_admin() and visibility = 'operational')
  );

-- Views. security_invoker stays off so the owner can read base tables, then the WHERE hides rows.
create view public.v_catalog
with (security_invoker = false) as
select
  p.public_code,
  p.name,
  p.description,
  p.category_id,
  c.name_ar as category_name,
  p.list_price,
  p.status,
  pm.storage_path as primary_image_path,
  (p.product_type = 'set') as is_set,
  e.base_amount as est_base_commission,
  e.bonus_amount as est_bonus,
  e.total as est_total,
  exists (
    select 1 from public.reservations r
    where r.product_id = p.id
      and r.component_id is null
      and r.status = 'active'
      and r.user_id = auth.uid()
  ) as reserved_by_me,
  exists (
    select 1 from public.reservations r
    where r.product_id = p.id and r.component_id is null and r.status = 'active'
  ) as is_reserved
from public.products p
join public.categories c on c.id = p.category_id
left join public.product_media pm on pm.product_id = p.id and pm.is_primary
cross join lateral private.calc_earnings(p.id, null, p.list_price, now()) e
where private.is_sales_or_admin()
  and p.status in ('available', 'partially_sold');

create view public.v_my_sales
with (security_invoker = false) as
select
  s.id,
  s.invoice_no,
  s.customer_name,
  s.customer_phone,
  s.customer_address,
  s.notes,
  s.payment_method,
  s.delivery_status,
  s.delivery_date,
  s.delivery_address,
  s.delivered_at,
  s.total_list_price,
  s.total_price,
  s.status,
  s.sold_at
from public.sales s
where private.is_sales_or_admin()
  and (private.is_admin() or s.seller_id = auth.uid());

create view public.v_my_sale_items
with (security_invoker = false) as
select
  i.id,
  i.sale_id,
  p.public_code,
  case
    when i.component_id is null then p.name
    else comp.name
  end as name,
  i.list_price,
  i.sale_price,
  i.status,
  c.status as commission_status,
  c.base_amount,
  c.bonus_amount,
  c.total_amount
from public.sale_items i
join public.sales s on s.id = i.sale_id
join public.products p on p.id = i.product_id
left join public.product_components comp on comp.id = i.component_id
left join public.commissions c on c.sale_item_id = i.id and c.kind = 'earning'
where private.is_sales_or_admin()
  and (private.is_admin() or s.seller_id = auth.uid());

create view public.v_my_commissions
with (security_invoker = false) as
select
  c.id,
  c.sale_id,
  c.sale_item_id,
  c.kind,
  c.status,
  c.base_type,
  c.base_value,
  c.base_amount,
  c.bonus_amount,
  c.total_amount,
  c.created_at,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'rule_name', b.rule_name,
        'bonus_type', b.bonus_type,
        'bonus_value', b.bonus_value,
        'amount', b.amount
      ) order by b.rule_name)
      from public.commission_bonuses b
      where b.commission_id = c.id
    ),
    '[]'::jsonb
  ) as bonus_lines
from public.commissions c
where private.is_active_user()
  and (private.is_admin() or c.user_id = auth.uid());

create view public.sale_payment_summary
with (security_invoker = false) as
select
  s.id as sale_id,
  s.total_price,
  coalesce(sum(p.amount) filter (where p.kind = 'payment'), 0) as paid_amount,
  coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0) as refunded_amount,
  coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0) as net_paid,
  s.total_price - coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0) as balance,
  case
    when coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0) = 0 then 'unpaid'
    when s.total_price - coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0) = 0 then 'paid'
    else 'partial'
  end as payment_status
from public.sales s
left join public.sale_payments p on p.sale_id = s.id
where private.is_admin() or (private.is_sales() and s.seller_id = auth.uid())
group by s.id;

create view public.installment_status
with (security_invoker = false) as
with active as (
  select
    i.id,
    i.sale_id,
    i.seq,
    i.due_date,
    i.amount,
    s.seller_id,
    coalesce(pay.net_paid, 0) as net_paid,
    coalesce(
      sum(i.amount) over (
        partition by i.sale_id
        order by i.seq
        rows between unbounded preceding and 1 preceding
      ),
      0
    ) as consumed_before
  from public.sale_installments i
  join public.sales s on s.id = i.sale_id
  left join lateral (
    select coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0) as net_paid
    from public.sale_payments p
    where p.sale_id = i.sale_id
  ) pay on true
  where i.superseded_at is null
    and (private.is_admin() or (private.is_sales() and s.seller_id = auth.uid()))
)
select
  id,
  sale_id,
  seq,
  due_date,
  amount,
  least(amount, greatest(net_paid - consumed_before, 0)) as covered,
  case
    when least(amount, greatest(net_paid - consumed_before, 0)) >= amount then 'paid'
    when due_date < (timezone('Africa/Cairo', now()))::date then 'overdue'
    when least(amount, greatest(net_paid - consumed_before, 0)) > 0 then 'partial'
    else 'upcoming'
  end as status
from active;

create or replace function public.fn_catalog_components(p_public_code text)
returns table (
  suffix text,
  name text,
  status public.product_status,
  list_price numeric,
  public_code text,
  est_base_commission numeric,
  est_bonus numeric,
  est_total numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_sales_or_admin();
  return query
  select
    c.suffix::text,
    c.name,
    c.status,
    c.list_price,
    (p.public_code || '-' || c.suffix)::text,
    e.base_amount,
    e.bonus_amount,
    e.total
  from public.products p
  join public.product_components c on c.product_id = p.id
  cross join lateral private.calc_earnings(p.id, c.id, c.list_price, now()) e
  where p.public_code = p_public_code
    and p.status in ('available', 'partially_sold')
    and c.status = 'available';
end;
$$;

create or replace function public.fn_product_media(p_public_code text)
returns table (
  kind public.media_kind,
  storage_path text,
  mime_type text,
  poster_path text,
  duration_seconds numeric,
  is_primary boolean,
  sort_order int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_sales_or_admin();
  return query
  select m.kind, m.storage_path, m.mime_type, m.poster_path, m.duration_seconds, m.is_primary, m.sort_order
  from public.products p
  join public.product_media m on m.product_id = p.id
  where p.public_code = p_public_code
  order by m.sort_order, m.created_at;
end;
$$;

create or replace function public.fn_my_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_sales_or_admin();
  return jsonb_build_object('from', p_from, 'to', p_to, 'ready', false);
end;
$$;

create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from public.profiles
    where id = uid and status = 'active' and must_change_password
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.profiles
  set must_change_password = false
  where id = uid;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, visibility)
  values (uid, 'user.password_changed', 'profiles', uid, 'restricted');
end;
$$;

create or replace function public.reserve_product(product_id uuid, component_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sales_or_admin();
  raise exception 'not_implemented:reserve_product' using errcode = '0A000';
end $$;

create or replace function public.cancel_reservation(id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sales_or_admin();
  raise exception 'not_implemented:cancel_reservation' using errcode = '0A000';
end $$;

create or replace function public.extend_reservation(id uuid, hours integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sales_or_admin();
  raise exception 'not_implemented:extend_reservation' using errcode = '0A000';
end $$;

create or replace function public.preview_sale_earnings(items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sales_or_admin();
  raise exception 'not_implemented:preview_sale_earnings' using errcode = '0A000';
end $$;

create or replace function public.request_price_approval(reservation_id uuid, price numeric, note text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sales_or_admin();
  raise exception 'not_implemented:request_price_approval' using errcode = '0A000';
end $$;

create or replace function public.decide_price_request(id uuid, approve boolean, price numeric, note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:decide_price_request' using errcode = '0A000';
end $$;

create or replace function public.complete_sale(items jsonb, customer jsonb, payment_method text, delivery jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sales_or_admin();
  raise exception 'not_implemented:complete_sale' using errcode = '0A000';
end $$;

create or replace function public.update_sale_customer(sale_id uuid, data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sales_or_admin();
  raise exception 'not_implemented:update_sale_customer' using errcode = '0A000';
end $$;

create or replace function public.request_sale_correction(sale_id uuid, note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sales_or_admin();
  raise exception 'not_implemented:request_sale_correction' using errcode = '0A000';
end $$;

create or replace function public.cancel_sale_item(
  sale_item_id uuid,
  reason text,
  restore_status public.product_status,
  refund jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:cancel_sale_item' using errcode = '0A000';
end $$;

create or replace function public.cancel_sale(
  sale_id uuid,
  reason text,
  restore_status public.product_status,
  refund jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:cancel_sale' using errcode = '0A000';
end $$;

create or replace function public.set_delivery(
  sale_id uuid,
  status public.delivery_status,
  delivery_date date,
  address text,
  notes text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:set_delivery' using errcode = '0A000';
end $$;

create or replace function public.record_sale_payment(
  sale_id uuid,
  kind public.payment_kind,
  amount numeric,
  paid_at date,
  method text,
  note text,
  reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:record_sale_payment' using errcode = '0A000';
end $$;

create or replace function public.set_installment_plan(sale_id uuid, rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:set_installment_plan' using errcode = '0A000';
end $$;

create or replace function public.reschedule_installments(sale_id uuid, rows jsonb, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:reschedule_installments' using errcode = '0A000';
end $$;

create or replace function public.approve_commissions(ids uuid[], override_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:approve_commissions' using errcode = '0A000';
end $$;

create or replace function public.record_commission_payout(
  user_id uuid,
  paid_at date,
  method text,
  note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:record_commission_payout' using errcode = '0A000';
end $$;

create or replace function public.bulk_update_commission(
  filters jsonb,
  ids uuid[],
  new_type public.commission_type,
  new_value numeric,
  note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:bulk_update_commission' using errcode = '0A000';
end $$;

create or replace function public.undo_bulk_commission(rule_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:undo_bulk_commission' using errcode = '0A000';
end $$;

create or replace function public.import_products(rows jsonb, file_name text)
returns int language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:import_products' using errcode = '0A000';
end $$;

create or replace function public.provision_user_audit(user_id uuid, method text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:provision_user_audit' using errcode = '0A000';
end $$;

create or replace function public.set_user_role(user_id uuid, role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:set_user_role' using errcode = '0A000';
end $$;

create or replace function public.set_user_status(user_id uuid, status public.account_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:set_user_status' using errcode = '0A000';
end $$;

create or replace function public.audit_password_action(user_id uuid, action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:audit_password_action' using errcode = '0A000';
end $$;

create or replace function public.reveal_national_id(user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, visibility)
  values (auth.uid(), 'user.national_id_revealed', 'employee_private_data', user_id, 'restricted');
end $$;

create or replace function public.update_setting(key text, value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:update_setting' using errcode = '0A000';
end $$;

create or replace function public.admin_dashboard_stats(
  p_from timestamptz,
  p_to timestamptz,
  store_ids uuid[],
  employee_ids uuid[],
  category_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin();
  raise exception 'not_implemented:admin_dashboard_stats' using errcode = '0A000';
end $$;

-- Cron jobs have no end-user session, so they do not call assert_active_user.
create or replace function public.expire_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return 0;
end;
$$;

create or replace function public.delivery_digest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return 0;
end;
$$;

create or replace function public.overdue_installments_digest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return 0;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'fn_catalog_components(text)',
    'fn_product_media(text)',
    'fn_my_dashboard(timestamptz, timestamptz)',
    'complete_password_change()',
    'reserve_product(uuid, uuid)',
    'cancel_reservation(uuid)',
    'extend_reservation(uuid, integer)',
    'preview_sale_earnings(jsonb)',
    'request_price_approval(uuid, numeric, text)',
    'decide_price_request(uuid, boolean, numeric, text)',
    'complete_sale(jsonb, jsonb, text, jsonb)',
    'update_sale_customer(uuid, jsonb)',
    'request_sale_correction(uuid, text)',
    'cancel_sale_item(uuid, text, public.product_status, jsonb)',
    'cancel_sale(uuid, text, public.product_status, jsonb)',
    'set_delivery(uuid, public.delivery_status, date, text, text)',
    'record_sale_payment(uuid, public.payment_kind, numeric, date, text, text, text)',
    'set_installment_plan(uuid, jsonb)',
    'reschedule_installments(uuid, jsonb, text)',
    'approve_commissions(uuid[], text)',
    'record_commission_payout(uuid, date, text, text)',
    'bulk_update_commission(jsonb, uuid[], public.commission_type, numeric, text)',
    'undo_bulk_commission(uuid)',
    'import_products(jsonb, text)',
    'provision_user_audit(uuid, text)',
    'set_user_role(uuid, public.app_role)',
    'set_user_status(uuid, public.account_status)',
    'audit_password_action(uuid, text)',
    'reveal_national_id(uuid)',
    'update_setting(text, jsonb)',
    'admin_dashboard_stats(timestamptz, timestamptz, uuid[], uuid[], uuid[])',
    'expire_reservations()',
    'delivery_digest()',
    'overdue_installments_digest()'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

grant execute on function public.expire_reservations() to service_role;
grant execute on function public.delivery_digest() to service_role;
grant execute on function public.overdue_installments_digest() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire-reservations', '*/5 * * * *', 'select public.expire_reservations()');
    perform cron.schedule('delivery-digest', '0 6 * * *', 'select public.delivery_digest()');
    perform cron.schedule('overdue-installments', '0 6 * * *', 'select public.overdue_installments_digest()');
  end if;
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;

-- Storage buckets. Create a local stub only when the Supabase storage schema is absent.
create schema if not exists storage;
do $$
begin
  if to_regclass('storage.buckets') is null then
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  end if;
  if to_regclass('storage.objects') is null then
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets (id),
      name text,
      owner uuid,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

-- On hosted Supabase the storage tables already exist and are owned by
-- supabase_storage_admin, so only enable RLS / grants when we own them.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'buckets'
      and c.relowner = (select oid from pg_roles where rolname = current_user)
  ) then
    execute 'alter table storage.buckets enable row level security';
  end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relowner = (select oid from pg_roles where rolname = current_user)
  ) then
    execute 'alter table storage.objects enable row level security';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('product-videos', 'product-videos', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tajdeed_media_admin_all on storage.objects;
create policy tajdeed_media_admin_all on storage.objects
  for all
  using (
    bucket_id in ('product-images', 'product-videos')
    and private.is_admin()
  )
  with check (
    bucket_id in ('product-images', 'product-videos')
    and private.is_admin()
  );

grant usage on schema storage to authenticated, service_role;
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and has_table_privilege(current_user, 'storage.objects', 'INSERT')
  ) then
    grant select, insert, update, delete on storage.objects to authenticated, service_role;
  end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'buckets'
  ) then
    begin
      grant select on storage.buckets to authenticated, service_role;
    exception
      when insufficient_privilege then
        null;
    end;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant select on
  public.v_catalog,
  public.v_my_sales,
  public.v_my_sale_items,
  public.v_my_commissions,
  public.sale_payment_summary,
  public.installment_status
to authenticated;

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated, service_role;
grant select on public.audit_logs to authenticated, service_role;

-- Reference data. No demo products or users.
insert into public.categories (name_ar, slug, sort_order) values
  ('الأثاث', 'athath', 1),
  ('الأجهزة المنزلية', 'aghiza', 2),
  ('أغراض منزلية أخرى', 'other', 3);

insert into public.categories (name_ar, slug, parent_id, sort_order)
select child.name_ar, child.slug, parent.id, child.sort_order
from (values
  ('كنب', 'kanab', 1),
  ('غرف نوم', 'ghuraf-nawm', 2),
  ('دواليب', 'dawalib', 3),
  ('مطابخ', 'matabikh', 4),
  ('أثاث مكتبي', 'athath-maktabi', 5),
  ('مكاتب', 'makatib', 6),
  ('كراسي', 'karasi', 7),
  ('ترابيزات', 'tarabezat', 8)
) as child(name_ar, slug, sort_order)
join public.categories parent on parent.slug = 'athath';

insert into public.categories (name_ar, slug, parent_id, sort_order)
select child.name_ar, child.slug, parent.id, child.sort_order
from (values
  ('غسالات', 'ghassalat', 1),
  ('ثلاجات', 'thallajat', 2)
) as child(name_ar, slug, sort_order)
join public.categories parent on parent.slug = 'aghiza';

insert into public.app_settings (key, value, super_admin_only) values
  ('reservation_hours', '48', false),
  ('max_active_reservations', '5', false),
  ('default_commission_type', '"percentage"', false),
  ('default_commission_value', '0', false),
  ('bonus_cap_amount', 'null', true),
  ('bonus_cap_percent_of_price', 'null', true),
  ('company_name', '"تجديد"', false),
  ('company_address', '""', false),
  ('company_phone', '""', false),
  ('company_footer', '"شكراً لثقتكم في تجديد"', false),
  ('receipt_prefix', '"RC"', false),
  ('invoice_prefix', '"INV"', false),
  ('payment_methods', '["كاش","تحويل","تقسيط"]', false);

do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity = false;
  if missing is not null then
    raise exception 'RLS missing on: %', missing;
  end if;
end $$;
