-- Phase 5 checks. Runs after phase 4B in the same database.
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare
  expected_revenue numeric;
  expected_items int;
begin
  select coalesce(sum(item.sale_price), 0), count(*)
  into expected_revenue, expected_items
  from public.sale_items item
  join public.sales sale on sale.id = item.sale_id
  where sale.seller_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    and sale.status = 'completed'
    and item.status = 'active';
  perform set_config('phase5.revenue', expected_revenue::text, false);
  perform set_config('phase5.items', expected_items::text, false);
end $$;

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);

do $$
begin
  perform public.admin_dashboard_stats(null, null, null, null, null);
  raise exception 'sales read the admin dashboard';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform count(*) from public.v_effective_sale_items;
  raise exception 'sales read effective sales';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
declare
  mine jsonb;
  expected_revenue numeric := current_setting('phase5.revenue')::numeric;
  expected_items int := current_setting('phase5.items')::int;
begin
  mine := public.fn_my_dashboard(null, null);
  if (mine ->> 'revenue')::numeric <> expected_revenue
    or (mine ->> 'products_sold')::int <> expected_items then
    raise exception 'sales dashboard was % / %, expected % / %',
      mine ->> 'revenue', mine ->> 'products_sold', expected_revenue, expected_items;
  end if;
  if mine::text ilike '%store_id%' or mine::text ilike '%min_price%' or mine::text like '%GZ-%' then
    raise exception 'sales dashboard exposed a private field';
  end if;
  if mine -> 'recent' is null or jsonb_typeof(mine -> 'series') <> 'array' then
    raise exception 'sales dashboard is missing its lists';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

do $$
declare
  stats jsonb;
  expected_revenue numeric;
  expected_sales int;
  seller_revenue numeric;
  filtered jsonb;
begin
  select coalesce(sum(item.sale_price), 0), count(distinct item.sale_id)
  into expected_revenue, expected_sales
  from public.sale_items item
  join public.sales sale on sale.id = item.sale_id
  where sale.status = 'completed' and item.status = 'active';

  stats := public.admin_dashboard_stats(null, null, null, null, null);
  if (stats #>> '{kpis,revenue}')::numeric <> expected_revenue
    or (stats #>> '{kpis,completed_sales}')::int <> expected_sales then
    raise exception 'dashboard revenue % sales % did not match % / %',
      stats #>> '{kpis,revenue}', stats #>> '{kpis,completed_sales}', expected_revenue, expected_sales;
  end if;
  if exists (
    select 1
    from public.sale_items item
    join public.sales sale on sale.id = item.sale_id
    where sale.customer_name = 'عميل صرف أ'
      and sale.status = 'completed'
      and item.status = 'active'
  ) then
    raise exception 'a cancelled sale was still counted';
  end if;
  if (stats #>> '{kpis,total_products}')::int < 1
    or (stats #>> '{kpis,stores}')::int < 1
    or (stats #>> '{kpis,admins}')::int < 1
    or (stats #>> '{kpis,sales_employees}')::int < 1
    or stats -> 'sales_over_time' is null
    or stats -> 'by_store' is null
    or stats -> 'by_category' is null
    or stats -> 'top_products' is null
    or stats -> 'employee_performance' is null
    or stats -> 'commission_distribution' is null then
    raise exception 'dashboard payload is incomplete';
  end if;

  select coalesce(sum(item.sale_price), 0) into seller_revenue
  from public.sale_items item
  join public.sales sale on sale.id = item.sale_id
  where sale.status = 'completed'
    and item.status = 'active'
    and sale.seller_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  filtered := public.admin_dashboard_stats(
    null, null, null, array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[], null
  );
  if (filtered #>> '{kpis,revenue}')::numeric <> seller_revenue then
    raise exception 'employee filter returned % instead of %', filtered #>> '{kpis,revenue}', seller_revenue;
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}', false);
do $$
begin
  if (select count(*) from public.audit_logs where visibility = 'restricted') <> 0 then
    raise exception 'a regular admin can read restricted audit rows';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);
do $$
begin
  if (select count(*) from public.audit_logs where visibility = 'restricted') = 0 then
    raise exception 'the super admin cannot read restricted audit rows';
  end if;
end $$;

-- Ten thousand historical sales, then the dashboard must answer within two seconds.
reset role;
insert into public.products (name, category_id, store_id, list_price, status, commission_type, commission_value)
select
  'حمل ' || g,
  (select id from public.categories where slug = 'karasi'),
  (select id from public.stores where store_code = 'ALT'),
  100,
  'sold',
  'fixed',
  0
from generate_series(1, 10000) g;

insert into public.sales (
  invoice_no, seller_id, customer_name, customer_phone, payment_method,
  total_list_price, total_price, sold_at, status
)
select
  'LOAD-' || lpad(g::text, 6, '0'),
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'حمل',
  '01000000000',
  'كاش',
  100,
  100,
  timestamptz '2020-06-01 10:00+00',
  'completed'
from generate_series(1, 10000) g;

insert into public.sale_items (sale_id, product_id, store_id, category_id, list_price, sale_price)
select sale.id, product.id, product.store_id, product.category_id, 100, 100
from public.sales sale
join public.products product
  on product.name = 'حمل ' || substring(sale.invoice_no from 6)::int
where sale.invoice_no like 'LOAD-%';

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

do $$
declare
  started timestamptz := clock_timestamp();
  stats jsonb;
begin
  stats := public.admin_dashboard_stats(
    '2019-01-01 00:00+02',
    '2021-01-01 00:00+02',
    null,
    array['cccccccc-cccc-cccc-cccc-cccccccccccc']::uuid[],
    null
  );
  if clock_timestamp() - started > interval '2 seconds' then
    raise exception 'dashboard took %', clock_timestamp() - started;
  end if;
  if (stats #>> '{kpis,completed_sales}')::int <> 10000
    or (stats #>> '{kpis,revenue}')::numeric <> 1000000 then
    raise exception 'the generated sales were counted as % / %',
      stats #>> '{kpis,completed_sales}', stats #>> '{kpis,revenue}';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', false);
