-- Phase 1: session gate, profile completion, and user-management RPCs.
-- Passwords are never written to tables or audit rows.

create or replace function private.assert_can_manage(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  manages_admin boolean;
begin
  perform private.assert_admin();
  if target is null or not exists (select 1 from public.profiles where id = target) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select exists (
    select 1
    from public.profiles p
    left join public.user_roles r on r.user_id = p.id
    where p.id = target
      and (p.is_super_admin or r.role = 'admin')
  ) into manages_admin;
  if manages_admin and not private.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_can_manage(uuid) from public, anon, authenticated;

create or replace function public.session_gate()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', p.status,
    'must_change_password', p.must_change_password,
    'profile_completed', p.profile_completed,
    'is_super_admin', p.is_super_admin,
    'role', r.role
  )
  from public.profiles p
  left join public.user_roles r on r.user_id = p.id
  where p.id = auth.uid();
$$;

create or replace function public.assert_password_strength(p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_password is null or char_length(p_password) < 10 then
    raise exception 'password_too_short' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.assert_can_provision(p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  if p_role = 'admin' and not private.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.touch_last_sign_in()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and must_change_password = false
  ) then
    raise exception 'not_active' using errcode = '42501';
  end if;
  update public.profiles set last_sign_in_at = now() where id = auth.uid();
end;
$$;

create or replace function public.complete_own_profile(
  p_full_name text,
  p_phone text,
  p_address text,
  p_national_id_encrypted text,
  p_national_id_hash text,
  p_national_id_masked text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from public.profiles
    where id = uid and status = 'active' and must_change_password = false
  ) then
    raise exception 'not_active' using errcode = '42501';
  end if;
  if p_full_name is null or char_length(trim(p_full_name)) < 3 then
    raise exception 'invalid_name' using errcode = '23514';
  end if;
  if p_phone is null or p_phone !~ '^(\+20|0)1[0125][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = '23514';
  end if;
  if p_address is null or char_length(trim(p_address)) < 5 or char_length(p_address) > 500 then
    raise exception 'invalid_address' using errcode = '23514';
  end if;
  if p_national_id_encrypted is null or p_national_id_hash is null or p_national_id_masked !~ '^[0-9]{2}\*{10}[0-9]{2}$' then
    raise exception 'invalid_national_id' using errcode = '23514';
  end if;
  if position(p_national_id_hash in p_national_id_encrypted) > 0 then
    raise exception 'invalid_national_id' using errcode = '23514';
  end if;

  insert into public.employee_private_data (
    user_id, phone, address, national_id_encrypted, national_id_hash, national_id_masked
  ) values (
    uid, p_phone, trim(p_address), p_national_id_encrypted, p_national_id_hash, p_national_id_masked
  );

  update public.profiles
  set full_name = trim(p_full_name), profile_completed = true
  where id = uid;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, visibility)
  values (uid, 'user.profile_completed', 'employee_private_data', uid, 'restricted');
end;
$$;

create or replace function public.admin_user_directory()
returns table (
  id uuid,
  email text,
  full_name text,
  status public.account_status,
  role public.app_role,
  is_super_admin boolean,
  profile_completed boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  national_id_masked text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  return query
  select
    p.id,
    p.email::text,
    p.full_name,
    p.status,
    r.role,
    p.is_super_admin,
    p.profile_completed,
    p.created_at,
    p.last_sign_in_at,
    e.national_id_masked
  from public.profiles p
  join public.user_roles r on r.user_id = p.id
  left join public.employee_private_data e on e.user_id = p.id
  order by p.created_at desc;
end;
$$;

create or replace function public.update_user_name(user_id uuid, full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous text;
begin
  perform private.assert_can_manage(user_id);
  if full_name is null or char_length(trim(full_name)) < 3 then
    raise exception 'invalid_name' using errcode = '23514';
  end if;
  select p.full_name into previous from public.profiles p where p.id = user_id;
  update public.profiles set full_name = trim(update_user_name.full_name) where id = user_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values, visibility)
  values (
    auth.uid(),
    'user.name_changed',
    'profiles',
    user_id,
    jsonb_build_object('full_name', previous),
    jsonb_build_object('full_name', trim(update_user_name.full_name)),
    'operational'
  );
end;
$$;

create or replace function public.set_user_role(user_id uuid, role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.app_role;
begin
  perform private.assert_can_manage(user_id);
  if set_user_role.role = 'admin' and not private.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select r.role into previous from public.user_roles r where r.user_id = set_user_role.user_id;
  if previous is not distinct from set_user_role.role then
    return;
  end if;
  update public.user_roles as assignment
  set role = set_user_role.role, assigned_by = auth.uid(), assigned_at = now()
  where assignment.user_id = set_user_role.user_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values, visibility)
  values (
    auth.uid(),
    'user.role_changed',
    'user_roles',
    user_id,
    jsonb_build_object('role', previous),
    jsonb_build_object('role', set_user_role.role),
    'restricted'
  );
end;
$$;

create or replace function public.set_user_status(user_id uuid, status public.account_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.account_status;
  product_ids uuid[];
  component_ids uuid[];
begin
  perform private.assert_can_manage(user_id);
  select p.status into previous from public.profiles p where p.id = user_id;
  if previous is not distinct from set_user_status.status then
    return;
  end if;

  if set_user_status.status = 'inactive' then
    select
      coalesce(array_agg(rv.product_id) filter (where rv.component_id is null), '{}'),
      coalesce(array_agg(rv.component_id) filter (where rv.component_id is not null), '{}')
    into product_ids, component_ids
    from public.reservations rv
    where rv.user_id = set_user_status.user_id and rv.status = 'active';

    update public.reservations as rv
    set status = 'cancelled', ended_at = now()
    where rv.user_id = set_user_status.user_id and rv.status = 'active';

    update public.products as product
    set status = 'available'
    where product.id = any(product_ids) and product.status = 'reserved';

    update public.product_components as component
    set status = 'available'
    where component.id = any(component_ids) and component.status = 'reserved';

    update public.price_requests as request
    set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decision_note = 'account deactivated'
    where request.requested_by = set_user_status.user_id and request.status = 'pending';
  end if;

  update public.profiles as profile
  set
    status = set_user_status.status,
    deactivated_at = case when set_user_status.status = 'inactive' then now() else null end
  where profile.id = set_user_status.user_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values, visibility)
  values (
    auth.uid(),
    'user.status_changed',
    'profiles',
    user_id,
    jsonb_build_object('status', previous),
    jsonb_build_object('status', set_user_status.status),
    'restricted'
  );
end;
$$;

create or replace function public.provision_user_audit(user_id uuid, method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_manage(user_id);
  if method not in ('invitation', 'random_password', 'custom_password') then
    raise exception 'invalid_method' using errcode = '23514';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (
    auth.uid(),
    'user.provisioned',
    'profiles',
    user_id,
    jsonb_build_object('method', method),
    'restricted'
  );
end;
$$;

create or replace function private.revoke_auth_sessions(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using target;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    begin
      execute 'delete from auth.refresh_tokens where user_id = $1' using target::text;
    exception when others then
      execute 'delete from auth.refresh_tokens where user_id = $1' using target;
    end;
  end if;
end;
$$;

create or replace function public.audit_password_action(user_id uuid, action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_manage(user_id);
  if action not in ('reset_link', 'random_temporary', 'custom_temporary') then
    raise exception 'invalid_method' using errcode = '23514';
  end if;
  update public.profiles
  set must_change_password = true
  where id = user_id and status = 'active';
  perform private.revoke_auth_sessions(user_id);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values, visibility)
  values (
    auth.uid(),
    'user.password_reset',
    'profiles',
    user_id,
    jsonb_build_object('method', action),
    'restricted'
  );
end;
$$;

drop function if exists public.reveal_national_id(uuid);
create function public.reveal_national_id(user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload text;
begin
  perform private.assert_can_manage(user_id);
  select e.national_id_encrypted into payload
  from public.employee_private_data e
  where e.user_id = reveal_national_id.user_id;
  if payload is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, visibility)
  values (auth.uid(), 'user.national_id_revealed', 'employee_private_data', user_id, 'restricted');
  return payload;
end;
$$;

create or replace function public.mark_notification_read(notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'not_active' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = notification_id and user_id = auth.uid();
end;
$$;

create or replace function public.update_setting(key text, value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous jsonb;
  restricted boolean;
begin
  perform private.assert_admin();
  select s.value, s.super_admin_only into previous, restricted
  from public.app_settings s
  where s.key = update_setting.key;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if restricted and not private.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.app_settings
  set value = update_setting.value, updated_by = auth.uid()
  where app_settings.key = update_setting.key;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values, visibility)
  values (
    auth.uid(),
    'setting.updated',
    'app_settings',
    null,
    jsonb_build_object('key', key, 'value', previous),
    jsonb_build_object('key', key, 'value', value),
    case when restricted then 'restricted'::public.audit_visibility else 'operational'::public.audit_visibility end
  );
end;
$$;

revoke all on function public.session_gate() from public, anon;
revoke all on function public.assert_password_strength(text) from public, anon;
revoke all on function public.assert_can_provision(public.app_role) from public, anon;
revoke all on function public.touch_last_sign_in() from public, anon;
revoke all on function public.complete_own_profile(text, text, text, text, text, text) from public, anon;
revoke all on function public.admin_user_directory() from public, anon;
revoke all on function public.update_user_name(uuid, text) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.reveal_national_id(uuid) from public, anon;

grant execute on function public.session_gate() to authenticated;
grant execute on function public.assert_password_strength(text) to authenticated, service_role;
grant execute on function public.assert_can_provision(public.app_role) to authenticated;
grant execute on function public.touch_last_sign_in() to authenticated;
grant execute on function public.complete_own_profile(text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_user_directory() to authenticated;
grant execute on function public.update_user_name(uuid, text) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.reveal_national_id(uuid) to authenticated;
