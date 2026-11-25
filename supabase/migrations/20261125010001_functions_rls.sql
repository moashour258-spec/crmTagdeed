-- Helpers, triggers, earnings, RLS, sales-safe views, and phase-0 RPC stubs.

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger employee_private_touch before update on public.employee_private_data
for each row execute function private.touch_updated_at();
create trigger stores_touch before update on public.stores
for each row execute function private.touch_updated_at();
create trigger categories_touch before update on public.categories
for each row execute function private.touch_updated_at();
create trigger products_touch before update on public.products
for each row execute function private.touch_updated_at();
create trigger bonus_rules_touch before update on public.bonus_rules
for each row execute function private.touch_updated_at();
create trigger app_settings_touch before update on public.app_settings
for each row execute function private.touch_updated_at();

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.must_change_password = false
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and r.role = 'admin'
      and p.status = 'active'
      and p.must_change_password = false
  );
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where p.id = auth.uid()
      and p.is_super_admin
      and r.role = 'admin'
      and p.status = 'active'
      and p.must_change_password = false
  );
$$;

create or replace function private.is_sales()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and r.role = 'sales'
      and p.status = 'active'
      and p.must_change_password = false
  );
$$;

create or replace function private.is_sales_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or private.is_sales();
$$;

create or replace function private.assert_active_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'not_active' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_active_user();
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_sales_or_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_active_user();
  if not private.is_sales_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.is_active_user() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.is_super_admin() from public;
revoke all on function private.is_sales() from public;
revoke all on function private.is_sales_or_admin() from public;
revoke all on function private.assert_active_user() from public;
revoke all on function private.assert_admin() from public;
revoke all on function private.assert_sales_or_admin() from public;
grant execute on function private.is_active_user() to anon, authenticated, service_role;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_super_admin() to anon, authenticated, service_role;
grant execute on function private.is_sales() to anon, authenticated, service_role;
grant execute on function private.is_sales_or_admin() to anon, authenticated, service_role;
grant execute on function private.assert_active_user() to authenticated, service_role;
grant execute on function private.assert_admin() to authenticated, service_role;
grant execute on function private.assert_sales_or_admin() to authenticated, service_role;

-- Provisioning
create or replace function private.enforce_provision_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.created_by is not distinct from old.created_by then
    return new;
  end if;
  if new.created_by is null and exists (select 1 from public.profiles) then
    raise exception 'provision_requires_creator' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger account_provisions_creator
before insert or update on public.account_provisions
for each row execute function private.enforce_provision_creator();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provision public.account_provisions;
begin
  select * into provision
  from public.account_provisions
  where email = new.email::public.citext
    and consumed_at is null;

  if not found then
    raise exception 'signup_not_provisioned' using errcode = '42501';
  end if;

  insert into public.profiles (id, email, status, must_change_password, created_by)
  values (new.id, new.email::public.citext, 'active', provision.must_change_password, provision.created_by);

  insert into public.user_roles (user_id, role, assigned_by)
  values (new.id, provision.role, provision.created_by);

  update public.account_provisions
  set consumed_at = now()
  where email = provision.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  other_admins int;
begin
  if old.is_super_admin and (
    new.is_super_admin = false
    or new.status <> 'active'
    or new.email is distinct from old.email
  ) then
    raise exception 'super_admin_immutable' using errcode = '42501';
  end if;

  if old.status = 'active' and new.status = 'inactive' and exists (
    select 1 from public.user_roles r where r.user_id = old.id and r.role = 'admin'
  ) then
    select count(*) into other_admins
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where r.role = 'admin' and p.status = 'active' and p.id <> old.id;
    if other_admins < 1 then
      raise exception 'last_admin' using errcode = '42501';
    end if;
    new.deactivated_at = coalesce(new.deactivated_at, now());
  end if;

  if auth.uid() is null or exists (
    select 1 from pg_roles r
    where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)
  ) then
    return new;
  end if;

  if not private.is_admin() and (
    new.email is distinct from old.email
    or new.status is distinct from old.status
    or new.must_change_password is distinct from old.must_change_password
    or new.is_super_admin is distinct from old.is_super_admin
    or new.profile_completed is distinct from old.profile_completed
    or new.created_by is distinct from old.created_by
    or new.deactivated_at is distinct from old.deactivated_at
    or new.last_sign_in_at is distinct from old.last_sign_in_at
  ) then
    raise exception 'profile_field_locked' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard
before update on public.profiles
for each row execute function private.guard_profile_update();

create or replace function private.guard_user_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  other_admins int;
begin
  if exists (
    select 1 from public.profiles p where p.id = new.user_id and p.is_super_admin
  ) and new.role <> 'admin' then
    raise exception 'super_admin_immutable' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin' then
    select count(*) into other_admins
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where r.role = 'admin' and p.status = 'active' and p.id <> old.user_id;
    if other_admins < 1 then
      raise exception 'last_admin' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger user_roles_guard
before insert or update on public.user_roles
for each row execute function private.guard_user_role();

create or replace function private.guard_employee_private()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or exists (
    select 1 from pg_roles r
    where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)
  ) then
    return new;
  end if;
  if private.is_admin() then
    return new;
  end if;
  if new.national_id_encrypted is distinct from old.national_id_encrypted
    or new.national_id_hash is distinct from old.national_id_hash
    or new.national_id_masked is distinct from old.national_id_masked
    or new.user_id is distinct from old.user_id
  then
    raise exception 'private_field_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger employee_private_guard
before update on public.employee_private_data
for each row execute function private.guard_employee_private();

create or replace function private.guard_store_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.store_code is distinct from old.store_code and exists (
    select 1 from public.products p where p.store_id = old.id
  ) then
    raise exception 'store_code_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger stores_code_guard
before update on public.stores
for each row execute function private.guard_store_code();

create or replace function private.guard_category_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.categories parent
      where parent.id = new.parent_id and parent.parent_id is not null
    ) then
      raise exception 'category_depth' using errcode = '23514';
    end if;
    if exists (select 1 from public.categories child where child.parent_id = new.id) then
      raise exception 'category_depth' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_depth
before insert or update on public.categories
for each row execute function private.guard_category_depth();

create or replace function private.assign_product_codes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  store_code text;
begin
  if tg_op = 'UPDATE' and (
    new.code is distinct from old.code
    or new.public_code is distinct from old.public_code
    or new.seq_no is distinct from old.seq_no
  ) then
    raise exception 'product_code_immutable' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    select s.store_code into store_code from public.stores s where s.id = new.store_id;
    if store_code is null then
      raise exception 'store_not_found' using errcode = '23503';
    end if;
    new.code = store_code || '-' || lpad(new.seq_no::text, 5, '0');
    new.public_code = 'P-' || lpad(new.seq_no::text, 5, '0');
  end if;

  if new.status = 'available' and not exists (
    select 1 from public.product_media m
    where m.product_id = new.id and m.kind = 'image'
  ) then
    raise exception 'product_needs_image' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger products_codes
before insert or update on public.products
for each row execute function private.assign_product_codes();

create or replace function private.guard_media_counts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  images int;
  videos int;
begin
  if tg_op = 'INSERT' then
    select count(*) into images from public.product_media
    where product_id = new.product_id and kind = 'image';
    select count(*) into videos from public.product_media
    where product_id = new.product_id and kind = 'video';
    if images > 10 then
      raise exception 'too_many_images' using errcode = '23514';
    end if;
    if videos > 3 then
      raise exception 'too_many_videos' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' and old.kind = 'image' and exists (
    select 1 from public.products p
    where p.id = old.product_id and p.status = 'available'
  ) and not exists (
    select 1 from public.product_media m
    where m.product_id = old.product_id and m.kind = 'image' and m.id <> old.id
  ) then
    raise exception 'product_needs_image' using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger product_media_counts
after insert or delete on public.product_media
for each row execute function private.guard_media_counts();

create or replace function private.audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs_append_only' using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function private.audit_append_only();

create or replace function private.guard_notification_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or exists (
    select 1 from pg_roles r
    where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)
  ) then
    return new;
  end if;
  if new.user_id is distinct from old.user_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'notification_field_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger notifications_guard
before update on public.notifications
for each row execute function private.guard_notification_update();

create or replace function private.assert_sale_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sid uuid;
  expected numeric(12, 2);
  actual numeric(12, 2);
begin
  sid := coalesce(new.sale_id, old.sale_id);
  select coalesce(sum(sale_price), 0) into expected
  from public.sale_items
  where sale_id = sid and status = 'active';
  select total_price into actual from public.sales where id = sid;
  if actual is distinct from expected then
    raise exception 'sale_total_mismatch' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger sale_items_total_check
after insert or update or delete on public.sale_items
deferrable initially deferred
for each row execute function private.assert_sale_totals();

create constraint trigger sales_total_check
after update of total_price, status on public.sales
deferrable initially deferred
for each row execute function private.assert_sale_totals();

create or replace function private.guard_bonus_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rid uuid;
begin
  if tg_table_name = 'bonus_rules' then
    rid := coalesce(new.id, old.id);
  else
    rid := coalesce(new.rule_id, old.rule_id);
  end if;
  if not exists (select 1 from public.bonus_rules r where r.id = rid) then
    return null;
  end if;
  if exists (
    select 1
    from public.bonus_rules r
    where r.id = rid
      and r.price_min is null
      and r.price_max is null
      and not exists (select 1 from public.bonus_rule_products p where p.rule_id = r.id)
      and not exists (select 1 from public.bonus_rule_categories c where c.rule_id = r.id)
      and not exists (select 1 from public.bonus_rule_stores s where s.rule_id = r.id)
  ) then
    raise exception 'bonus_scope_required' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger bonus_rules_scope
after insert or update on public.bonus_rules
deferrable initially deferred
for each row execute function private.guard_bonus_scope();

create constraint trigger bonus_scope_products
after insert or delete on public.bonus_rule_products
deferrable initially deferred
for each row execute function private.guard_bonus_scope();
create constraint trigger bonus_scope_categories
after insert or delete on public.bonus_rule_categories
deferrable initially deferred
for each row execute function private.guard_bonus_scope();
create constraint trigger bonus_scope_stores
after insert or delete on public.bonus_rule_stores
deferrable initially deferred
for each row execute function private.guard_bonus_scope();

-- Earnings
create type private.earning_result as (
  base_type public.commission_type,
  base_value numeric(12, 2),
  base_amount numeric(12, 2),
  bonus_lines jsonb,
  bonus_amount numeric(12, 2),
  total numeric(12, 2)
);

create or replace function private.applicable_bonus_rules(
  p_product uuid,
  p_component uuid,
  p_price numeric,
  p_at timestamptz
)
returns setof public.bonus_rules
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.bonus_rules r
  join public.products p on p.id = p_product
  left join public.categories c on c.id = p.category_id
  where r.is_active
    and (r.starts_at is null or r.starts_at <= p_at)
    and (r.ends_at is null or r.ends_at > p_at)
    and (r.price_min is null or p_price >= r.price_min)
    and (r.price_max is null or p_price <= r.price_max)
    and (
      not exists (select 1 from public.bonus_rule_products bp where bp.rule_id = r.id)
      or exists (
        select 1 from public.bonus_rule_products bp
        where bp.rule_id = r.id and bp.product_id = p.id
      )
    )
    and (
      not exists (select 1 from public.bonus_rule_categories bc where bc.rule_id = r.id)
      or exists (
        select 1 from public.bonus_rule_categories bc
        where bc.rule_id = r.id
          and (bc.category_id = p.category_id or bc.category_id = c.parent_id)
      )
    )
    and (
      not exists (select 1 from public.bonus_rule_stores bs where bs.rule_id = r.id)
      or exists (
        select 1 from public.bonus_rule_stores bs
        where bs.rule_id = r.id and bs.store_id = p.store_id
      )
    );
$$;

create or replace function private.json_number(p_key text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.value is null or s.value = 'null'::jsonb then null
    else (s.value #>> '{}')::numeric
  end
  from public.app_settings s
  where s.key = p_key;
$$;

create or replace function private.calc_earnings(
  p_product uuid,
  p_component uuid,
  p_price numeric,
  p_at timestamptz
)
returns private.earning_result
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result private.earning_result;
  base_type public.commission_type;
  base_value numeric(12, 2);
  line jsonb;
  lines jsonb := '[]'::jsonb;
  raw_sum numeric(12, 2) := 0;
  cap_amount numeric;
  cap_percent numeric;
  cap_from_percent numeric;
  cap numeric;
  factor numeric;
  scaled jsonb := '[]'::jsonb;
  scaled_sum numeric(12, 2) := 0;
  remainder numeric(12, 2);
  idx int := 0;
  best int := 0;
  best_amount numeric := -1;
  item jsonb;
  adjusted numeric(12, 2);
begin
  if p_component is null then
    select p.commission_type, p.commission_value
    into base_type, base_value
    from public.products p
    where p.id = p_product;
  else
    select c.commission_type, c.commission_value
    into base_type, base_value
    from public.product_components c
    where c.id = p_component and c.product_id = p_product;
  end if;

  if base_type is null then
    raise exception 'unit_not_found' using errcode = 'P0002';
  end if;

  result.base_type := base_type;
  result.base_value := base_value;
  if base_type = 'percentage' then
    result.base_amount := round(p_price * base_value / 100, 2);
  else
    result.base_amount := least(base_value, p_price);
  end if;

  for line in
    select jsonb_build_object(
      'rule_id', r.id,
      'rule_name', r.name,
      'bonus_type', r.bonus_type,
      'bonus_value', r.bonus_value,
      'amount', case
        when r.bonus_type = 'percentage' then round(p_price * r.bonus_value / 100, 2)
        else r.bonus_value
      end
    )
    from private.applicable_bonus_rules(p_product, p_component, p_price, p_at) r
  loop
    lines := lines || jsonb_build_array(line);
    raw_sum := raw_sum + (line ->> 'amount')::numeric;
  end loop;

  cap_amount := private.json_number('bonus_cap_amount');
  cap_percent := private.json_number('bonus_cap_percent_of_price');
  cap_from_percent := case
    when cap_percent is null then null
    else round(p_price * cap_percent / 100, 2)
  end;
  cap := case
    when cap_amount is null then cap_from_percent
    when cap_from_percent is null then cap_amount
    else least(cap_amount, cap_from_percent)
  end;

  if cap is not null and raw_sum > cap and raw_sum > 0 then
    factor := cap / raw_sum;
    for item in select value from jsonb_array_elements(lines)
    loop
      adjusted := round((item ->> 'amount')::numeric * factor, 2);
      item := item || jsonb_build_object('amount', adjusted, 'capped', true);
      scaled := scaled || jsonb_build_array(item);
      scaled_sum := scaled_sum + adjusted;
      if adjusted > best_amount then
        best_amount := adjusted;
        best := idx;
      end if;
      idx := idx + 1;
    end loop;
    remainder := cap - scaled_sum;
    if remainder <> 0 and jsonb_array_length(scaled) > 0 then
      item := scaled -> best;
      item := item || jsonb_build_object('amount', (item ->> 'amount')::numeric + remainder);
      scaled := jsonb_set(scaled, array[best::text], item);
    end if;
    lines := scaled;
    raw_sum := cap;
  end if;

  result.bonus_lines := lines;
  result.bonus_amount := raw_sum;
  result.total := result.base_amount + result.bonus_amount;
  return result;
end;
$$;

revoke all on function private.applicable_bonus_rules(uuid, uuid, numeric, timestamptz) from public;
revoke all on function private.calc_earnings(uuid, uuid, numeric, timestamptz) from public;
revoke all on function private.json_number(text) from public;
