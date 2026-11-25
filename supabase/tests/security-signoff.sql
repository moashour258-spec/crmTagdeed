-- Phase 6 sign-off gaps: every table has RLS, anonymous reads nothing,
-- sales cannot write money or media, videos stay within the limits,
-- and even service_role cannot edit the audit log.
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare
  open_table text;
begin
  select c.relname into open_table
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
  limit 1;
  if open_table is not null then
    raise exception 'RLS is off on %', open_table;
  end if;
end $$;

do $$
declare
  product_id uuid;
begin
  select id into product_id from public.products where name = 'كنبة';
  insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes)
  values (product_id, 'video', 'products/too-big.mp4', 'video/mp4', 52428801);
  raise exception 'oversized video was accepted';
exception
  when check_violation then
    null;
end $$;

do $$
declare
  product_id uuid;
  n int;
begin
  select id into product_id from public.products where name = 'كنبة';
  for n in 1..3 loop
    insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes, sort_order)
    values (product_id, 'video', 'products/clip-' || n || '.mp4', 'video/mp4', 1000, 20 + n);
  end loop;
  begin
    insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes)
    values (product_id, 'video', 'products/clip-4.mp4', 'video/mp4', 1000);
    raise exception 'fourth video was accepted';
  exception
    when check_violation then
      null;
  end;
end $$;

set role service_role;
do $$
begin
  update public.audit_logs set reason = 'tamper';
  raise exception 'service role updated the audit log';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  delete from public.audit_logs;
  raise exception 'service role deleted the audit log';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
set role anon;
do $$
declare
  rel text;
  seen bigint;
begin
  for rel in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('select count(*) from public.%I', rel) into seen;
    if seen <> 0 then
      raise exception 'anonymous role read % rows from %', seen, rel;
    end if;
  end loop;
end $$;

do $$
begin
  perform count(*) from storage.objects;
  if found and (select count(*) from storage.objects) <> 0 then
    raise exception 'anonymous role listed storage objects';
  end if;
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
set role app_tester;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);

do $$
begin
  if (select count(*) from public.product_media) <> 0
    or (select count(*) from public.commission_rules) <> 0
    or (select count(*) from public.bonus_rules) <> 0 then
    raise exception 'sales can read media or commission rules';
  end if;
end $$;

do $$
begin
  insert into public.sales (
    invoice_no, seller_id, customer_name, customer_phone, payment_method, total_list_price, total_price
  ) values (
    'SEC-1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'عميل', '01000000000', 'كاش', 1, 1
  );
  raise exception 'sales inserted a sale';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  update public.sales set notes = 'تعديل';
  if found then
    raise exception 'sales updated a sale';
  end if;
  delete from public.sale_items;
  if found then
    raise exception 'sales deleted a sale item';
  end if;
end $$;

do $$
begin
  perform public.register_product_media(
    (select id from public.products limit 1),
    'image',
    'products/sales.jpg',
    'image/jpeg',
    1000,
    null,
    null
  );
  raise exception 'sales registered media';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
select set_config('request.jwt.claims', '', false);
