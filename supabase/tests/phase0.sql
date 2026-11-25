-- Phase 0 checks against the local harness. Fails the session on the first broken rule.
\set ON_ERROR_STOP on

grant authenticated to app_tester;
grant anon to app_tester;

insert into public.account_provisions (email, role, must_change_password)
values ('moashour258@gmail.com', 'admin', false);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'moashour258@gmail.com');

update public.profiles
set is_super_admin = true,
    profile_completed = true,
    full_name = 'المدير العام'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
begin
  if not exists (
    select 1
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where p.email = 'moashour258@gmail.com'
      and p.is_super_admin
      and p.status = 'active'
      and p.profile_completed
      and p.must_change_password = false
      and r.role = 'admin'
  ) then
    raise exception 'super admin seed did not land';
  end if;
end $$;

do $$
begin
  insert into auth.users (id, email)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'stranger@example.com');
  raise exception 'unprovisioned signup was accepted';
exception
  when insufficient_privilege then
    null;
end $$;

insert into public.account_provisions (email, role, must_change_password, created_by)
values (
  'sales@example.com',
  'sales',
  false,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
insert into auth.users (id, email)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'sales@example.com');

insert into public.account_provisions (email, role, must_change_password, created_by)
values (
  'locked@example.com',
  'sales',
  true,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
insert into auth.users (id, email)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'locked@example.com');

do $$
declare
  missing int;
begin
  select count(*) into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing <> 0 then
    raise exception 'RLS disabled on % public tables', missing;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('v_catalog', 'v_my_sales', 'v_my_sale_items', 'v_my_commissions')
      and column_name in ('store_id', 'code', 'min_price')
  ) then
    raise exception 'sales view exposes a forbidden column';
  end if;
end $$;

insert into public.stores (name, store_code) values ('المخزن الرئيسي', 'GZ');
insert into public.products (name, category_id, store_id, list_price, commission_type, commission_value)
select 'كنبة', id, (select id from public.stores where store_code = 'GZ'), 10000, 'percentage', 5
from public.categories where slug = 'kanab';

do $$
declare
  earned numeric;
begin
  if (select code from public.products where name = 'كنبة') <> 'GZ-00001' then
    raise exception 'product code was not generated';
  end if;
  if (select public_code from public.products where name = 'كنبة') <> 'P-00001' then
    raise exception 'public code was not generated';
  end if;
  select (private.calc_earnings(id, null, 10000, now())).base_amount
  into earned
  from public.products where name = 'كنبة';
  if earned <> 500 then
    raise exception 'expected 500 EGP commission, got %', earned;
  end if;
end $$;

update public.products set commission_type = 'fixed', commission_value = 300 where name = 'كنبة';
do $$
declare
  earned numeric;
begin
  select (private.calc_earnings(id, null, 10000, now())).base_amount into earned
  from public.products where name = 'كنبة';
  if earned <> 300 then
    raise exception 'expected fixed 300, got %', earned;
  end if;
end $$;

do $$
begin
  update public.products set status = 'available' where name = 'كنبة';
  raise exception 'available without an image was accepted';
exception
  when check_violation then
    null;
end $$;

do $$
declare
  child uuid;
begin
  select id into child from public.categories where slug = 'kanab';
  insert into public.categories (name_ar, slug, parent_id) values ('مستوى ثالث', 'too-deep', child);
  raise exception 'category depth was not enforced';
exception
  when check_violation then
    null;
end $$;

do $$
declare
  pid uuid;
  i int;
begin
  select id into pid from public.products where name = 'كنبة';
  for i in 1..10 loop
    insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes, is_primary, sort_order)
    values (pid, 'image', 'products/' || i || '.jpg', 'image/jpeg', 1000, i = 1, i);
  end loop;
  begin
    insert into public.product_media (product_id, kind, storage_path, mime_type, size_bytes)
    values (pid, 'image', 'products/11.jpg', 'image/jpeg', 1000);
    raise exception '11th image was accepted';
  exception
    when check_violation then
      null;
  end;
  update public.products set status = 'available' where id = pid;
end $$;

insert into public.audit_logs (actor_id, action, entity_type, entity_id, visibility)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'phase0.check',
  'profiles',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'operational'
);

do $$
begin
  update public.audit_logs set reason = 'tamper' where action = 'phase0.check';
  raise exception 'audit update was accepted';
exception
  when insufficient_privilege then
    null;
end $$;

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

do $$
begin
  if (select count(*) from public.stores) <> 1 then
    raise exception 'admin cannot see the store';
  end if;
  if (select count(*) from public.categories) < 13 then
    raise exception 'admin cannot see seeded categories';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);
do $$
begin
  if (select count(*) from public.stores) <> 0 then
    raise exception 'sales can see stores';
  end if;
  if (select count(*) from public.products) <> 0 then
    raise exception 'sales can see products';
  end if;
  if (select count(*) from public.audit_logs) <> 0 then
    raise exception 'sales can see audit logs';
  end if;
  if exists (
    select 1 from public.app_settings
    where key in ('bonus_cap_amount', 'default_commission_value')
  ) then
    raise exception 'sales can see sensitive settings';
  end if;
  if (select count(*) from public.app_settings where key = 'company_name') <> 1 then
    raise exception 'sales cannot see company name';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}', false);
do $$
begin
  if (select count(*) from public.profiles) <> 0
    or (select count(*) from public.categories) <> 0
    or (select count(*) from public.notifications) <> 0 then
    raise exception 'password-change user can read rows';
  end if;
end $$;

select public.complete_password_change();

do $$
begin
  if (select must_change_password from public.profiles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') then
    raise exception 'password flag was not cleared';
  end if;
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'user still cannot read their profile';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
do $$
begin
  if (select count(*) from public.profiles) <> 0
    or (select count(*) from public.stores) <> 0
    or (select count(*) from public.products) <> 0 then
    raise exception 'anonymous role can read rows';
  end if;
end $$;

do $$
begin
  perform public.complete_password_change();
  raise exception 'anonymous role executed an RPC';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
