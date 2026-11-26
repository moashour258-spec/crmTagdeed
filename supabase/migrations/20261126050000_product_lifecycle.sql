-- Activate / soft-archive / hard-delete products from the admin product page.

create or replace function public.activate_product(product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.products;
begin
  perform private.assert_admin();
  select * into current from public.products p where p.id = activate_product.product_id for update;
  if current.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if current.status in ('sold', 'partially_sold', 'reserved') then
    raise exception 'product_not_activatable' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.product_media m
    where m.product_id = current.id and m.kind = 'image'
  ) then
    raise exception 'product_needs_image' using errcode = '23514';
  end if;
  update public.products p
  set status = 'available'
  where p.id = current.id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (auth.uid(), 'product.activated', 'products', current.id, jsonb_build_object('status', 'available'), 'operational');
end;
$$;

create or replace function public.archive_product(product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.products;
begin
  perform private.assert_admin();
  select * into current from public.products p where p.id = archive_product.product_id for update;
  if current.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if current.status in ('sold', 'partially_sold', 'reserved') then
    raise exception 'product_not_deletable' using errcode = '23514';
  end if;
  update public.products p
  set status = 'inactive'
  where p.id = current.id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (auth.uid(), 'product.archived', 'products', current.id, jsonb_build_object('status', 'inactive'), 'operational');
end;
$$;

create or replace function public.delete_product(product_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.products;
  paths text[] := '{}';
begin
  perform private.assert_admin();
  select * into current from public.products p where p.id = delete_product.product_id for update;
  if current.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if current.status in ('sold', 'partially_sold', 'reserved') then
    raise exception 'product_not_deletable' using errcode = '23514';
  end if;
  if exists (select 1 from public.sale_items si where si.product_id = current.id) then
    raise exception 'product_has_sales' using errcode = '23514';
  end if;
  if exists (select 1 from public.reservations r where r.product_id = current.id and r.status = 'active') then
    raise exception 'product_not_deletable' using errcode = '23514';
  end if;

  -- Drop media first while product is inactive so the last-image guard allows it.
  update public.products p set status = 'inactive' where p.id = current.id;

  select coalesce(array_agg(path), '{}') into paths
  from (
    select unnest(array_remove(array[m.storage_path, m.poster_path], null)) as path
    from public.product_media m
    where m.product_id = current.id
  ) listed;

  delete from public.product_media where product_id = current.id;
  delete from public.product_components where product_id = current.id;
  delete from public.reservations where product_id = current.id and status <> 'active';
  delete from public.products where id = current.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, visibility)
  values (auth.uid(), 'product.deleted', 'products', current.id, 'operational');
  return paths;
end;
$$;

revoke all on function public.activate_product(uuid) from public, anon;
revoke all on function public.archive_product(uuid) from public, anon;
revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.activate_product(uuid) to authenticated;
grant execute on function public.archive_product(uuid) to authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
