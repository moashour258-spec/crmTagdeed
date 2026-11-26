-- When the first product image is registered, activate inactive products for the sales catalog.

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
  current public.products;
begin
  perform private.assert_admin();
  select * into current from public.products p where p.id = register_product_media.product_id for update;
  if current.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select coalesce(max(m.sort_order), 0) + 1 into next_order
  from public.product_media m where m.product_id = current.id;

  insert into public.product_media (
    product_id, kind, storage_path, mime_type, size_bytes, duration_seconds, poster_path,
    sort_order, is_primary, created_by
  ) values (
    current.id, kind, storage_path, mime_type, size_bytes, duration_seconds, poster_path,
    next_order,
    kind = 'image' and not exists (
      select 1 from public.product_media m
      where m.product_id = current.id and m.is_primary
    ),
    auth.uid()
  ) returning id into media_id;

  if kind = 'image' and current.status = 'inactive' then
    update public.products p
    set status = 'available'
    where p.id = current.id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
    values (
      auth.uid(),
      'product.activated',
      'products',
      current.id,
      jsonb_build_object('status', 'available', 'via', 'first_image'),
      'operational'
    );
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (auth.uid(), 'product.media_added', 'product_media', media_id, jsonb_build_object('kind', kind), 'operational');
  return media_id;
end;
$$;

revoke all on function public.register_product_media(uuid, public.media_kind, text, text, bigint, numeric, text) from public, anon;
grant execute on function public.register_product_media(uuid, public.media_kind, text, text, bigint, numeric, text) to authenticated;
