-- Phase 3 checks. Runs after phase 2 in the same database.
\set ON_ERROR_STOP on

-- 5. Catalog and sales views do not expose the store, the full code, or the floor price.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('v_catalog', 'v_my_sales', 'v_my_sale_items', 'v_my_commissions')
      and column_name in ('store_id', 'code', 'min_price')
  ) then
    raise exception 'sales view exposes a private column';
  end if;
end $$;

insert into public.account_provisions (email, role, must_change_password, created_by)
values ('sales.b@example.com', 'sales', false, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into auth.users (id, email)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'sales.b@example.com');

update public.profiles
set must_change_password = false, profile_completed = true, full_name = 'مندوب ب'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

insert into public.employee_private_data (user_id, phone, address, national_id_encrypted, national_id_hash, national_id_masked)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '01000000000',
  'عنوان المندوب',
  'cipher',
  'hash-sales-b',
  '29**********12'
);

update public.products set min_price = 8000 where name = 'كنبة';

insert into public.products (name, category_id, store_id, list_price, min_price, commission_type, commission_value)
select 'طاولة', category.id, store.id, 5000, 4000, 'fixed', 100
from public.categories category, public.stores store
where category.slug = 'karasi' and store.store_code = 'ALT';

insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes, is_primary)
select id, 'image', 'products/table.jpg', 'image/jpeg', 1000, true
from public.products where name = 'طاولة';

update public.products set status = 'available' where name = 'طاولة';

insert into public.products (name, category_id, store_id, product_type, allow_piece_sale, list_price, min_price, commission_type, commission_value)
select 'طقم', category.id, store.id, 'set', true, 3000, 2500, 'fixed', 50
from public.categories category, public.stores store
where category.slug = 'kanab' and store.store_code = 'ALT';

insert into public.product_components (product_id, suffix, name, list_price, min_price, commission_type, commission_value)
select products.id, piece.suffix, piece.piece_name, 1500, 1200, 'fixed', 20
from public.products
cross join (values ('A', 'قطعة أ'), ('B', 'قطعة ب')) as piece(suffix, piece_name)
where products.name = 'طقم';

insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes, is_primary)
select id, 'image', 'products/set.jpg', 'image/jpeg', 1000, true
from public.products where name = 'طقم';

update public.products set status = 'available' where name = 'طقم';

do $$
declare
  i int;
  category_id uuid;
  store_id uuid;
begin
  select id into category_id from public.categories where slug = 'karasi';
  select id into store_id from public.stores where store_code = 'ALT';
  for i in 1..6 loop
    insert into public.products (name, category_id, store_id, list_price, commission_type, commission_value)
    values ('حجز ' || i, category_id, store_id, 1000, 'fixed', 10);
    insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes, is_primary)
    select id, 'image', 'products/hold-' || i || '.jpg', 'image/jpeg', 1000, true
    from public.products where name = 'حجز ' || i;
    update public.products set status = 'available' where name = 'حجز ' || i;
  end loop;
  insert into public.products (name, category_id, store_id, list_price, commission_type, commission_value)
  values
    ('سلة 1', category_id, store_id, 1000, 'fixed', 10),
    ('سلة 2', category_id, store_id, 2000, 'fixed', 10),
    ('سلة 3', category_id, store_id, 3000, 'fixed', 10),
    ('سباق', category_id, store_id, 2200, 'fixed', 10);
  insert into public.products (name, category_id, store_id, product_type, allow_piece_sale, list_price, commission_type, commission_value)
  values ('طقم سباق', category_id, store_id, 'set', true, 4000, 'fixed', 10);
end $$;

insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes, is_primary)
select id, 'image', 'products/' || name || '.jpg', 'image/jpeg', 1000, true
from public.products
where name in ('سلة 1', 'سلة 2', 'سلة 3', 'سباق', 'طقم سباق');

insert into public.product_components (product_id, suffix, name, list_price, commission_type, commission_value)
select products.id, piece.suffix, piece.piece_name, 2000, 'fixed', 10
from public.products
cross join (values ('A', 'سباق أ'), ('B', 'سباق ب')) as piece(suffix, piece_name)
where products.name = 'طقم سباق';

update public.products set status = 'available'
where name in ('سلة 1', 'سلة 2', 'سلة 3', 'سباق', 'طقم سباق');

-- 4, 6. Sales cannot read another seller's private rows or write financial tables.
set role app_tester;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);

do $$
begin
  if (select count(*) from public.products) <> 0
    or (select count(*) from public.stores) <> 0
    or (select count(*) from public.commission_rules) <> 0
    or (select count(*) from public.bonus_rules) <> 0
    or (select count(*) from public.audit_logs) <> 0
    or (select count(*) from public.sales) <> 0
    or (select count(*) from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') <> 0
    or (select count(*) from public.employee_private_data where user_id <> auth.uid()) <> 0 then
    raise exception 'sales can read another seller or a restricted table';
  end if;
  if exists (
    select 1 from public.app_settings
    where key in ('bonus_cap_amount', 'default_commission_value', 'min_price')
  ) then
    raise exception 'sales can read a sensitive setting';
  end if;
  if (select public_code from public.v_catalog where name = 'كنبة') <> 'P-00001' then
    raise exception 'sales catalog is missing the public code';
  end if;
end $$;

do $$
begin
  insert into public.sales (
    invoice_no, seller_id, customer_name, customer_phone, payment_method, total_list_price, total_price
  ) values ('INV-HACK', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'عميل', '01000000000', 'كاش', 1, 1);
  raise exception 'sales inserted a sale directly';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  update public.products set list_price = 1 where name = 'كنبة';
  if found then
    raise exception 'sales updated a product';
  end if;
end $$;

do $$
begin
  perform public.preview_sale_earnings('[{"public_code":"P-00001","price":100}]'::jsonb);
  raise exception 'price below the floor was accepted';
exception
  when check_violation then
    if sqlerrm like '%8000%' or sqlerrm like '%10000%' then
      raise exception 'price error leaked the floor: %', sqlerrm;
    end if;
    if sqlerrm not like '%كنبة%' then
      raise exception 'price error did not name the item: %', sqlerrm;
    end if;
end $$;

do $$
declare
  i int;
  code text;
  reservation_id uuid;
begin
  for i in 1..5 loop
    select public_code into code from public.v_catalog where name = 'حجز ' || i;
    perform public.reserve_by_code(code, null);
  end loop;
  select public_code into code from public.v_catalog where name = 'حجز 6';
  begin
    perform public.reserve_by_code(code, null);
    raise exception 'reservation cap was ignored';
  exception
    when check_violation then
      if sqlerrm not like '%reservation_cap%' then
        raise;
      end if;
  end;
  for reservation_id in select id from public.reservations where user_id = auth.uid() and status = 'active'
  loop
    perform public.cancel_reservation(reservation_id);
  end loop;
end $$;

do $$
declare
  code text;
  reservation_id uuid;
  request_id uuid;
  created uuid;
begin
  select public_code into code from public.v_catalog where name = 'طاولة';
  reservation_id := public.reserve_by_code(code, null);
  request_id := public.request_price_approval(reservation_id, 2000, 'خصم');
  if (select reserved_by_me from public.v_catalog where public_code = code) is not true then
    raise exception 'the seller cannot see their own hold';
  end if;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);
  perform public.decide_price_request(request_id, true, 2000, 'موافق');
  perform set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);
  created := public.complete_sale(
    jsonb_build_array(jsonb_build_object('public_code', code, 'price', 2000)),
    '{"name":"عميل الطاولة","phone":"01011111111","address":"القاهرة"}'::jsonb,
    'كاش',
    null
  );
  if (select total_amount from public.v_my_commissions where v_my_commissions.sale_id = created) <> 100 then
    raise exception 'fixed commission was not snapshotted';
  end if;
  if (select status from public.price_requests where price_requests.id = request_id) <> 'used' then
    raise exception 'approved price was not consumed';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}', false);

do $$
declare
  code text;
begin
  if (select count(*) from public.v_my_sales) <> 0
    or (select count(*) from public.v_my_commissions) <> 0
    or (select count(*) from public.notifications where type = 'sale_completed') <> 0
    or (select count(*) from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') <> 0 then
    raise exception 'sales can read another seller private data';
  end if;
  select public_code into code from public.v_catalog where name = 'حجز 6';
  perform public.complete_sale(
    jsonb_build_array(jsonb_build_object('public_code', code, 'price', 1000)),
    '{"name":"عميل ب","phone":"01022222222"}'::jsonb,
    'تحويل',
    null
  );
end $$;

select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);

do $$
declare
  codes text[];
  created uuid;
  set_code text;
begin
  if (select count(*) from public.v_my_sales where customer_name = 'عميل ب') <> 0
    or (select count(*) from public.notifications where type = 'sale_completed' and body like 'INV-%' and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') <> 0 then
    raise exception 'sales A can see sales B';
  end if;
  select array_agg(public_code order by name) into codes
  from public.v_catalog where name in ('سلة 1', 'سلة 2', 'سلة 3');
  created := public.complete_sale(
    jsonb_build_array(
      jsonb_build_object('public_code', codes[1], 'price', 800),
      jsonb_build_object('public_code', codes[2], 'price', 1600),
      jsonb_build_object('public_code', codes[3], 'price', 2600)
    ),
    '{"name":"عميل السلة","phone":"01033333333"}'::jsonb,
    'كاش',
    null
  );
  if (select total_price from public.v_my_sales where v_my_sales.id = created) <> 5000 then
    raise exception 'basket total is not the sum of the lines';
  end if;
  if (select count(*) from public.v_my_sale_items where v_my_sale_items.sale_id = created) <> 3 then
    raise exception 'basket did not keep all three lines';
  end if;
  select public_code into set_code from public.v_catalog where name = 'طقم';
  perform public.complete_sale(
    jsonb_build_array(jsonb_build_object('public_code', set_code, 'suffix', 'A', 'price', 1500)),
    '{"name":"عميل القطعة","phone":"01044444444"}'::jsonb,
    'كاش',
    null
  );
  begin
    perform public.complete_sale(
      jsonb_build_array(jsonb_build_object('public_code', set_code, 'price', 3000)),
      '{"name":"عميل الطقم","phone":"01055555555"}'::jsonb,
      'كاش',
      null
    );
    raise exception 'a partial set was sold whole';
  exception
    when check_violation then
      if sqlerrm not like '%set_partially_sold%' and sqlerrm not like '%unit_unavailable%' then
        raise;
      end if;
  end;
  begin
    perform public.complete_sale(
      jsonb_build_array(jsonb_build_object('public_code', set_code, 'suffix', 'A', 'price', 1500)),
      '{"name":"عميل مكرر","phone":"01066666666"}'::jsonb,
      'كاش',
      null
    );
    raise exception 'a sold component was sold again';
  exception
    when check_violation then
      null;
  end;
  perform public.request_sale_correction(created, 'تصحيح اسم العميل');
end $$;

do $$
begin
  perform public.extend_reservation('00000000-0000-0000-0000-000000000000', 2);
  raise exception 'sales extended a reservation';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.audit_logs where action = 'sale_completed') < 2 then
    raise exception 'sales were not audited';
  end if;
  if (select status from public.products where name = 'سباق') <> 'available'
    or (select status from public.products where name = 'طقم سباق') <> 'available' then
    raise exception 'race products were consumed by the single-session checks';
  end if;
end $$;
