-- Phase 5: dashboard numbers, sales summary, and the shared definition of a countable sale.

create index if not exists sale_items_store_idx on public.sale_items (store_id);
create index if not exists sale_items_category_idx on public.sale_items (category_id);

create or replace view public.v_effective_sale_items
with (security_invoker = false) as
select
  i.id as sale_item_id,
  i.sale_id,
  i.product_id,
  i.store_id,
  i.category_id,
  i.sale_price,
  s.seller_id,
  s.sold_at,
  s.invoice_no,
  s.customer_name,
  s.total_price
from public.sale_items i
join public.sales s on s.id = i.sale_id
where s.status = 'completed'
  and i.status = 'active'
  and private.is_admin();

revoke all on public.v_effective_sale_items from public, anon, authenticated;

create or replace function public.admin_dashboard_stats(
  p_from timestamptz,
  p_to timestamptz,
  store_ids uuid[],
  employee_ids uuid[],
  category_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stores uuid[] := coalesce(admin_dashboard_stats.store_ids, '{}'::uuid[]);
  employees uuid[] := coalesce(admin_dashboard_stats.employee_ids, '{}'::uuid[]);
  categories uuid[] := coalesce(admin_dashboard_stats.category_ids, '{}'::uuid[]);
  revenue numeric;
  sale_count int;
  commission_total numeric;
  bonus_total numeric;
  product_total int;
  product_available int;
  product_reserved int;
  product_sold int;
  store_count int;
  admin_count int;
  sales_count int;
  over_time jsonb;
  by_store jsonb;
  by_category jsonb;
  top_products jsonb;
  employees_json jsonb;
  distribution jsonb;
begin
  perform private.assert_admin();

  select
    count(*),
    count(*) filter (where p.status = 'available'),
    count(*) filter (where p.status = 'reserved'),
    count(*) filter (where p.status = 'sold')
  into product_total, product_available, product_reserved, product_sold
  from public.products p
  where (cardinality(stores) = 0 or p.store_id = any(stores))
    and (
      cardinality(categories) = 0
      or p.category_id = any(categories)
      or exists (
        select 1 from public.categories c
        where c.id = p.category_id and c.parent_id = any(categories)
      )
    );

  select count(*) into store_count
  from public.stores s
  where cardinality(stores) = 0 or s.id = any(stores);

  select
    count(*) filter (where r.role = 'admin' and p.status = 'active'),
    count(*) filter (where r.role = 'sales' and p.status = 'active')
  into admin_count, sales_count
  from public.user_roles r
  join public.profiles p on p.id = r.user_id;

  select coalesce(sum(item.sale_price), 0), count(distinct item.sale_id)
  into revenue, sale_count
  from public.v_effective_sale_items item
  join public.categories c on c.id = item.category_id
  where (admin_dashboard_stats.p_from is null or item.sold_at >= admin_dashboard_stats.p_from)
    and (admin_dashboard_stats.p_to is null or item.sold_at < admin_dashboard_stats.p_to)
    and (cardinality(stores) = 0 or item.store_id = any(stores))
    and (cardinality(employees) = 0 or item.seller_id = any(employees))
    and (
      cardinality(categories) = 0
      or item.category_id = any(categories)
      or c.parent_id = any(categories)
    );

  select coalesce(sum(commission.total_amount), 0), coalesce(sum(commission.bonus_amount), 0)
  into commission_total, bonus_total
  from public.v_effective_sale_items item
  join public.categories c on c.id = item.category_id
  join public.commissions commission on commission.sale_item_id = item.sale_item_id
  where commission.kind = 'earning'
    and commission.status <> 'cancelled'
    and (admin_dashboard_stats.p_from is null or item.sold_at >= admin_dashboard_stats.p_from)
    and (admin_dashboard_stats.p_to is null or item.sold_at < admin_dashboard_stats.p_to)
    and (cardinality(stores) = 0 or item.store_id = any(stores))
    and (cardinality(employees) = 0 or item.seller_id = any(employees))
    and (
      cardinality(categories) = 0
      or item.category_id = any(categories)
      or c.parent_id = any(categories)
    );

  select coalesce(jsonb_agg(jsonb_build_object('day', bucket.day, 'total', bucket.total) order by bucket.day), '[]'::jsonb)
  into over_time
  from (
    select (timezone('Africa/Cairo', item.sold_at))::date as day, sum(item.sale_price) as total
    from public.v_effective_sale_items item
    join public.categories c on c.id = item.category_id
    where (admin_dashboard_stats.p_from is null or item.sold_at >= admin_dashboard_stats.p_from)
      and (admin_dashboard_stats.p_to is null or item.sold_at < admin_dashboard_stats.p_to)
      and (cardinality(stores) = 0 or item.store_id = any(stores))
      and (cardinality(employees) = 0 or item.seller_id = any(employees))
      and (
        cardinality(categories) = 0
        or item.category_id = any(categories)
        or c.parent_id = any(categories)
      )
    group by 1
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object('name', bucket.name, 'total', bucket.total) order by bucket.total desc), '[]'::jsonb)
  into by_store
  from (
    select store.name, sum(item.sale_price) as total
    from public.v_effective_sale_items item
    join public.stores store on store.id = item.store_id
    join public.categories c on c.id = item.category_id
    where (admin_dashboard_stats.p_from is null or item.sold_at >= admin_dashboard_stats.p_from)
      and (admin_dashboard_stats.p_to is null or item.sold_at < admin_dashboard_stats.p_to)
      and (cardinality(stores) = 0 or item.store_id = any(stores))
      and (cardinality(employees) = 0 or item.seller_id = any(employees))
      and (
        cardinality(categories) = 0
        or item.category_id = any(categories)
        or c.parent_id = any(categories)
      )
    group by store.name
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object('name', bucket.name, 'total', bucket.total) order by bucket.total desc), '[]'::jsonb)
  into by_category
  from (
    select c.name_ar as name, sum(item.sale_price) as total
    from public.v_effective_sale_items item
    join public.categories c on c.id = item.category_id
    where (admin_dashboard_stats.p_from is null or item.sold_at >= admin_dashboard_stats.p_from)
      and (admin_dashboard_stats.p_to is null or item.sold_at < admin_dashboard_stats.p_to)
      and (cardinality(stores) = 0 or item.store_id = any(stores))
      and (cardinality(employees) = 0 or item.seller_id = any(employees))
      and (
        cardinality(categories) = 0
        or item.category_id = any(categories)
        or c.parent_id = any(categories)
      )
    group by c.name_ar
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object('name', bucket.name, 'total', bucket.total) order by bucket.total desc), '[]'::jsonb)
  into top_products
  from (
    select product.name, sum(item.sale_price) as total
    from public.v_effective_sale_items item
    join public.products product on product.id = item.product_id
    join public.categories c on c.id = item.category_id
    where (admin_dashboard_stats.p_from is null or item.sold_at >= admin_dashboard_stats.p_from)
      and (admin_dashboard_stats.p_to is null or item.sold_at < admin_dashboard_stats.p_to)
      and (cardinality(stores) = 0 or item.store_id = any(stores))
      and (cardinality(employees) = 0 or item.seller_id = any(employees))
      and (
        cardinality(categories) = 0
        or item.category_id = any(categories)
        or c.parent_id = any(categories)
      )
    group by product.id, product.name
    order by sum(item.sale_price) desc
    limit 8
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', bucket.name,
    'sales', bucket.sales,
    'revenue', bucket.revenue,
    'commission', bucket.commission
  ) order by bucket.revenue desc), '[]'::jsonb)
  into employees_json
  from (
    select
      coalesce(profile.full_name, profile.email::text) as name,
      count(distinct item.sale_id) as sales,
      sum(item.sale_price) as revenue,
      coalesce(sum(commission.total_amount) filter (where commission.status <> 'cancelled' and commission.kind = 'earning'), 0) as commission
    from public.v_effective_sale_items item
    join public.profiles profile on profile.id = item.seller_id
    join public.categories c on c.id = item.category_id
    left join public.commissions commission on commission.sale_item_id = item.sale_item_id and commission.kind = 'earning'
    where (admin_dashboard_stats.p_from is null or item.sold_at >= admin_dashboard_stats.p_from)
      and (admin_dashboard_stats.p_to is null or item.sold_at < admin_dashboard_stats.p_to)
      and (cardinality(stores) = 0 or item.store_id = any(stores))
      and (cardinality(employees) = 0 or item.seller_id = any(employees))
      and (
        cardinality(categories) = 0
        or item.category_id = any(categories)
        or c.parent_id = any(categories)
      )
    group by profile.id, profile.full_name, profile.email
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object('status', bucket.status, 'total', bucket.total)), '[]'::jsonb)
  into distribution
  from (
    select commission.status, sum(commission.total_amount) as total
    from public.v_effective_sale_items item
    join public.categories c on c.id = item.category_id
    join public.commissions commission on commission.sale_item_id = item.sale_item_id
    where commission.kind = 'earning'
      and (admin_dashboard_stats.p_from is null or item.sold_at >= admin_dashboard_stats.p_from)
      and (admin_dashboard_stats.p_to is null or item.sold_at < admin_dashboard_stats.p_to)
      and (cardinality(stores) = 0 or item.store_id = any(stores))
      and (cardinality(employees) = 0 or item.seller_id = any(employees))
      and (
        cardinality(categories) = 0
        or item.category_id = any(categories)
        or c.parent_id = any(categories)
      )
    group by commission.status
  ) bucket;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_products', product_total,
      'available_products', product_available,
      'reserved_products', product_reserved,
      'sold_products', product_sold,
      'stores', store_count,
      'admins', admin_count,
      'sales_employees', sales_count,
      'completed_sales', sale_count,
      'revenue', revenue,
      'total_commissions', commission_total,
      'total_bonuses', bonus_total
    ),
    'sales_over_time', over_time,
    'by_store', by_store,
    'by_category', by_category,
    'top_products', top_products,
    'employee_performance', employees_json,
    'commission_distribution', distribution
  );
end;
$$;

create or replace function public.fn_my_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  products_sold int;
  revenue numeric;
  commission_total numeric;
  bonus_total numeric;
  pending_amount numeric;
  approved_amount numeric;
  paid_amount numeric;
  recent jsonb;
  series jsonb;
begin
  perform private.assert_sales_or_admin();

  select
    count(*),
    coalesce(sum(item.sale_price), 0)
  into products_sold, revenue
  from public.sale_items item
  join public.sales sale on sale.id = item.sale_id
  where sale.seller_id = uid
    and sale.status = 'completed'
    and item.status = 'active'
    and (fn_my_dashboard.p_from is null or sale.sold_at >= fn_my_dashboard.p_from)
    and (fn_my_dashboard.p_to is null or sale.sold_at < fn_my_dashboard.p_to);

  select
    coalesce(sum(commission.total_amount) filter (where commission.status <> 'cancelled'), 0),
    coalesce(sum(commission.bonus_amount) filter (where commission.status <> 'cancelled'), 0),
    coalesce(sum(commission.total_amount) filter (where commission.status = 'pending'), 0),
    coalesce(sum(commission.total_amount) filter (where commission.status = 'approved'), 0),
    coalesce(sum(commission.total_amount) filter (where commission.status = 'paid'), 0)
  into commission_total, bonus_total, pending_amount, approved_amount, paid_amount
  from public.commissions commission
  join public.sales sale on sale.id = commission.sale_id
  where commission.user_id = uid
    and commission.kind = 'earning'
    and sale.status = 'completed'
    and (fn_my_dashboard.p_from is null or sale.sold_at >= fn_my_dashboard.p_from)
    and (fn_my_dashboard.p_to is null or sale.sold_at < fn_my_dashboard.p_to);

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice', recent_sale.invoice_no,
    'customer', recent_sale.customer_name,
    'total', recent_sale.total_price,
    'sold_at', recent_sale.sold_at
  ) order by recent_sale.sold_at desc), '[]'::jsonb)
  into recent
  from (
    select sale.invoice_no, sale.customer_name, sale.total_price, sale.sold_at
    from public.sales sale
    where sale.seller_id = uid
      and sale.status = 'completed'
      and (fn_my_dashboard.p_from is null or sale.sold_at >= fn_my_dashboard.p_from)
      and (fn_my_dashboard.p_to is null or sale.sold_at < fn_my_dashboard.p_to)
    order by sale.sold_at desc
    limit 5
  ) recent_sale;

  select coalesce(jsonb_agg(jsonb_build_object('day', bucket.day, 'total', bucket.total) order by bucket.day), '[]'::jsonb)
  into series
  from (
    select (timezone('Africa/Cairo', sale.sold_at))::date as day, sum(item.sale_price) as total
    from public.sale_items item
    join public.sales sale on sale.id = item.sale_id
    where sale.seller_id = uid
      and sale.status = 'completed'
      and item.status = 'active'
      and (fn_my_dashboard.p_from is null or sale.sold_at >= fn_my_dashboard.p_from)
      and (fn_my_dashboard.p_to is null or sale.sold_at < fn_my_dashboard.p_to)
    group by 1
  ) bucket;

  return jsonb_build_object(
    'products_sold', products_sold,
    'revenue', revenue,
    'earned_commission', commission_total,
    'earned_bonus', bonus_total,
    'pending', pending_amount,
    'approved', approved_amount,
    'paid', paid_amount,
    'recent', recent,
    'series', series
  );
end;
$$;
