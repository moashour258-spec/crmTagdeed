-- Phase 2 catalog checks. Runs after phase 1 in the same database.
\set ON_ERROR_STOP on

-- Stock blocks deactivation. Moving stock keeps the original code.
do $$
begin
  update public.stores set is_active = false where store_code = 'GZ';
  raise exception 'store with stock was deactivated';
exception
  when check_violation then
    null;
end $$;

insert into public.stores (name, store_code) values ('مخزن النقل', 'ALT');

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);
select public.move_store_products(
  (select id from public.stores where store_code = 'GZ'),
  (select id from public.stores where store_code = 'ALT')
);

do $$
begin
  if (select code from public.products where name = 'كنبة') <> 'GZ-00001' then
    raise exception 'moving a product changed its code';
  end if;
  if (select store_code from public.stores s join public.products p on p.store_id = s.id where p.name = 'كنبة') <> 'ALT' then
    raise exception 'product did not move';
  end if;
end $$;

reset role;
update public.stores set is_active = false where store_code = 'GZ';

-- A bad import changes nothing. A valid import creates an inactive product and one audit row.
set role app_tester;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

do $$
begin
  perform public.import_products(
    '[{"name":"خطأ","category":"فئة غير موجودة","store":"مخزن النقل","list_price":100}]'::jsonb,
    'bad.csv'
  );
  raise exception 'bad import was accepted';
exception
  when check_violation then
    null;
end $$;

select public.import_products(
  '[{"name":"كرسي مستورد","category":"كراسي","store":"مخزن النقل","list_price":1500,"commission_type":"percentage","commission_value":5}]'::jsonb,
  'good.csv'
);

do $$
begin
  if (select status from public.products where name = 'كرسي مستورد') <> 'inactive' then
    raise exception 'imported product was not inactive';
  end if;
  if (select count(*) from public.products where name = 'خطأ') <> 0 then
    raise exception 'rejected import row was stored';
  end if;
  if (select count(*) from public.audit_logs where action = 'product.imported' and new_values->>'file_name' = 'good.csv') <> 1 then
    raise exception 'import was not audited once';
  end if;
end $$;

-- Sales still cannot read catalog tables.
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);
do $$
begin
  if (select count(*) from public.stores) <> 0
    or (select count(*) from public.products) <> 0
    or (select count(*) from public.product_media) <> 0 then
    raise exception 'sales can read catalog tables';
  end if;
  perform public.import_products('[]'::jsonb, 'sales.csv');
  raise exception 'sales imported products';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
select set_config('request.jwt.claims', '', false);
