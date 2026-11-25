-- Phase 2 catalog rules. Codes stay immutable; stock blocks store deactivation.

create or replace function private.guard_store_active()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_active and new.is_active = false and exists (
    select 1
    from public.products p
    where p.store_id = old.id
      and p.status in ('available', 'reserved')
  ) then
    raise exception 'store_has_stock' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists stores_active_guard on public.stores;
create trigger stores_active_guard
before update on public.stores
for each row execute function private.guard_store_active();

create or replace function public.move_store_products(from_store uuid, to_store uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
  sample_code text;
begin
  perform private.assert_admin();
  if from_store = to_store then
    raise exception 'same_store' using errcode = '23514';
  end if;
  if not exists (select 1 from public.stores s where s.id = to_store and s.is_active) then
    raise exception 'store_inactive' using errcode = '23514';
  end if;
  select p.code into sample_code
  from public.products p
  where p.store_id = from_store and p.status in ('available', 'reserved')
  limit 1;

  update public.products p
  set store_id = to_store
  where p.store_id = from_store and p.status in ('available', 'reserved');
  get diagnostics moved = row_count;

  if sample_code is not null and exists (
    select 1 from public.products p where p.code = sample_code and p.code is distinct from sample_code
  ) then
    raise exception 'product_code_changed' using errcode = '23514';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (
    auth.uid(),
    'store.products_moved',
    'stores',
    from_store,
    jsonb_build_object('to_store', to_store, 'count', moved),
    'operational'
  );
  return moved;
end;
$$;

create or replace function public.reorder_categories(ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i integer;
begin
  perform private.assert_admin();
  for i in 1 .. coalesce(array_length(ids, 1), 0) loop
    update public.categories set sort_order = i where id = ids[i];
  end loop;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (auth.uid(), 'category.reordered', 'categories', null, jsonb_build_object('count', coalesce(array_length(ids, 1), 0)), 'operational');
end;
$$;

create or replace function public.duplicate_product(product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.products;
  copy_id uuid;
begin
  perform private.assert_admin();
  select * into source from public.products p where p.id = product_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.products (
    name, description, category_id, store_id, product_type, allow_piece_sale,
    status, list_price, min_price, commission_type, commission_value, created_by
  ) values (
    source.name, source.description, source.category_id, source.store_id, source.product_type,
    source.allow_piece_sale, 'inactive', source.list_price, source.min_price,
    source.commission_type, source.commission_value, auth.uid()
  ) returning id into copy_id;

  if source.allow_piece_sale then
    insert into public.product_components (
      product_id, suffix, name, status, list_price, min_price, commission_type, commission_value
    )
    select copy_id, c.suffix, c.name, 'available', c.list_price, c.min_price, c.commission_type, c.commission_value
    from public.product_components c
    where c.product_id = source.id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (auth.uid(), 'product.duplicated', 'products', copy_id, jsonb_build_object('source', source.id), 'operational');
  return copy_id;
end;
$$;

create or replace function public.import_products(rows jsonb, file_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  index integer := 0;
  inserted integer := 0;
  category_id uuid;
  store_id uuid;
  parent_name text;
  child_name text;
  list_price numeric(12, 2);
  min_price numeric(12, 2);
  commission_type public.commission_type;
  commission_value numeric(12, 2);
  product_type public.product_type;
begin
  perform private.assert_admin();
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'invalid_import' using errcode = '23514';
  end if;
  if jsonb_array_length(rows) > 500 then
    raise exception 'too_many_rows' using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(rows) loop
    index := index + 1;
    if coalesce(item->>'name', '') = '' then
      raise exception 'import_row_%_name', index using errcode = '23514';
    end if;
    begin
      list_price := (item->>'list_price')::numeric(12, 2);
    exception when others then
      raise exception 'import_row_%_price', index using errcode = '23514';
    end;
    if list_price is null or list_price <= 0 then
      raise exception 'import_row_%_price', index using errcode = '23514';
    end if;
    min_price := nullif(item->>'min_price', '')::numeric(12, 2);
    if min_price is not null and (min_price <= 0 or min_price > list_price) then
      raise exception 'import_row_%_min_price', index using errcode = '23514';
    end if;

    child_name := trim(item->>'category');
    parent_name := null;
    if position('>' in child_name) > 0 then
      parent_name := trim(split_part(child_name, '>', 1));
      child_name := trim(split_part(child_name, '>', 2));
    end if;
    select c.id into category_id
    from public.categories c
    left join public.categories parent on parent.id = c.parent_id
    where c.name_ar = child_name
      and c.is_active
      and (parent_name is null or parent.name_ar = parent_name);
    if category_id is null then
      raise exception 'import_row_%_category', index using errcode = '23514';
    end if;

    select s.id into store_id from public.stores s where s.name = item->>'store' and s.is_active;
    if store_id is null then
      raise exception 'import_row_%_store', index using errcode = '23514';
    end if;

    commission_type := coalesce(nullif(item->>'commission_type', '')::public.commission_type, 'percentage');
    commission_value := coalesce(nullif(item->>'commission_value', '')::numeric(12, 2), 0);
    product_type := coalesce(nullif(item->>'product_type', '')::public.product_type, 'single');
    if commission_value < 0 or (commission_type = 'percentage' and commission_value > 100) then
      raise exception 'import_row_%_commission', index using errcode = '23514';
    end if;

    insert into public.products (
      name, description, category_id, store_id, product_type, status,
      list_price, min_price, commission_type, commission_value, created_by
    ) values (
      item->>'name', nullif(item->>'description', ''), category_id, store_id, product_type, 'inactive',
      list_price, min_price, commission_type, commission_value, auth.uid()
    );
    inserted := inserted + 1;
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (
    auth.uid(),
    'product.imported',
    'products',
    null,
    jsonb_build_object('file_name', file_name, 'count', inserted),
    'operational'
  );
  return inserted;
end;
$$;

create or replace function public.register_product_media(
  product_id uuid,
  kind public.media_kind,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  poster_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_id uuid;
  next_order integer;
begin
  perform private.assert_admin();
  select coalesce(max(m.sort_order), 0) + 1 into next_order
  from public.product_media m where m.product_id = register_product_media.product_id;
  insert into public.product_media (
    product_id, kind, storage_path, mime_type, size_bytes, duration_seconds, poster_path,
    sort_order, is_primary, created_by
  ) values (
    product_id, kind, storage_path, mime_type, size_bytes, duration_seconds, poster_path,
    next_order,
    kind = 'image' and not exists (
      select 1 from public.product_media m
      where m.product_id = register_product_media.product_id and m.is_primary
    ),
    auth.uid()
  ) returning id into media_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (auth.uid(), 'product.media_added', 'product_media', media_id, jsonb_build_object('kind', kind), 'operational');
  return media_id;
end;
$$;

create or replace function public.delete_product_media(media_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths text[];
  owner uuid;
begin
  perform private.assert_admin();
  select m.product_id, array_remove(array[m.storage_path, m.poster_path], null)
  into owner, paths
  from public.product_media m
  where m.id = media_id;
  if owner is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  delete from public.product_media where id = media_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, visibility)
  values (auth.uid(), 'product.media_deleted', 'products', owner, 'operational');
  return paths;
end;
$$;

revoke all on function public.move_store_products(uuid, uuid) from public, anon;
revoke all on function public.reorder_categories(uuid[]) from public, anon;
revoke all on function public.duplicate_product(uuid) from public, anon;
revoke all on function public.register_product_media(uuid, public.media_kind, text, text, bigint, numeric, text) from public, anon;
revoke all on function public.delete_product_media(uuid) from public, anon;
grant execute on function public.move_store_products(uuid, uuid) to authenticated;
grant execute on function public.reorder_categories(uuid[]) to authenticated;
grant execute on function public.duplicate_product(uuid) to authenticated;
grant execute on function public.register_product_media(uuid, public.media_kind, text, text, bigint, numeric, text) to authenticated;
grant execute on function public.delete_product_media(uuid) to authenticated;
