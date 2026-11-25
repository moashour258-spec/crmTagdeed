-- Phase 1 checks. Runs after phase0.sql in the same database.
\set ON_ERROR_STOP on

insert into public.account_provisions (email, role, must_change_password, created_by)
values
  ('admin.one@example.com', 'admin', false, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('admin.two@example.com', 'admin', false, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('locked2@example.com', 'sales', true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('inactive@example.com', 'sales', false, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into auth.users (id, email) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'admin.one@example.com'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'admin.two@example.com'),
  ('11111111-1111-1111-1111-111111111111', 'locked2@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'inactive@example.com');

update public.profiles set status = 'inactive', deactivated_at = now()
where id = '22222222-2222-2222-2222-222222222222';

create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid
);

-- 1. Anonymous cannot execute the new gate or a business RPC, and cannot sign up.
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;

do $$
begin
  perform public.session_gate();
  raise exception 'anonymous role executed session_gate';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.set_user_status('cccccccc-cccc-cccc-cccc-cccccccccccc', 'inactive');
  raise exception 'anonymous role executed set_user_status';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;
do $$
begin
  insert into auth.users (id, email)
  values ('99999999-9999-9999-9999-999999999999', 'unknown-phase1@example.com');
  raise exception 'unprovisioned signup was accepted';
exception
  when insufficient_privilege then
    null;
end $$;

-- 2. Locked user reads nothing and can only finish the password change.
set role app_tester;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);

do $$
begin
  if (select count(*) from public.profiles) <> 0
    or (select count(*) from public.notifications) <> 0
    or (select count(*) from public.stores) <> 0 then
    raise exception 'locked user can read rows';
  end if;
end $$;

do $$
begin
  perform public.set_user_status('cccccccc-cccc-cccc-cccc-cccccccccccc', 'inactive');
  raise exception 'locked user executed a business RPC';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.touch_last_sign_in();
  raise exception 'locked user updated last sign-in';
exception
  when insufficient_privilege then
    null;
end $$;

select public.session_gate();
select public.complete_password_change();

do $$
begin
  if (select must_change_password from public.profiles where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'locked user flag was not cleared';
  end if;
end $$;

-- 3. Inactive JWT reads nothing and cannot call RPCs.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', false);
do $$
begin
  if (select count(*) from public.profiles) <> 0 or (select count(*) from public.categories) <> 0 then
    raise exception 'inactive user can read rows';
  end if;
  perform public.complete_password_change();
  raise exception 'inactive user executed an RPC';
exception
  when insufficient_privilege then
    null;
end $$;

-- 7 and 8. Regular admin cannot manage admins, the super admin, or restricted settings.
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}', false);

do $$
begin
  perform public.set_user_status('ffffffff-ffff-ffff-ffff-ffffffffffff', 'inactive');
  raise exception 'regular admin deactivated another admin';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.set_user_role('ffffffff-ffff-ffff-ffff-ffffffffffff', 'sales');
  raise exception 'regular admin changed another admin role';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.audit_password_action('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'reset_link');
  raise exception 'regular admin reset the super admin password';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.assert_can_provision('admin');
  raise exception 'regular admin provisioned an admin';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.update_setting('bonus_cap_amount', '10');
  raise exception 'regular admin changed a super-admin setting';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  if (select count(*) from public.audit_logs where visibility = 'restricted') <> 0 then
    raise exception 'regular admin can read restricted audit rows';
  end if;
end $$;

-- Super admin cannot be deactivated or demoted.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', false);

do $$
begin
  perform public.set_user_status('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'inactive');
  raise exception 'super admin was deactivated';
exception
  when insufficient_privilege then
    null;
end $$;

do $$
begin
  perform public.set_user_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sales');
  raise exception 'super admin was demoted';
exception
  when insufficient_privilege then
    null;
end $$;

-- Last remaining admin cannot be deactivated. The check runs in the trigger for every role.
reset role;
alter table public.profiles disable trigger profiles_guard;
update public.profiles
set status = 'inactive', deactivated_at = now()
where id in (select user_id from public.user_roles where role = 'admin')
  and id <> 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
alter table public.profiles enable trigger profiles_guard;

do $$
begin
  update public.profiles set status = 'inactive'
  where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  raise exception 'last admin was deactivated';
exception
  when insufficient_privilege then
    null;
end $$;

alter table public.profiles disable trigger profiles_guard;
update public.profiles
set status = 'active', deactivated_at = null
where id in (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'ffffffff-ffff-ffff-ffff-ffffffffffff'
);
alter table public.profiles enable trigger profiles_guard;

-- 17. Password actions store the method only, reject weak passwords, and revoke sessions.
insert into auth.sessions (user_id)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc');

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}', false);
select public.audit_password_action('cccccccc-cccc-cccc-cccc-cccccccccccc', 'custom_temporary');

do $$
begin
  perform public.audit_password_action('cccccccc-cccc-cccc-cccc-cccccccccccc', 'SecretPasswordValue');
  raise exception 'password text was accepted as an action';
exception
  when check_violation then
    null;
end $$;

do $$
begin
  perform public.assert_password_strength('tiny-pw');
  raise exception 'weak password was accepted';
exception
  when check_violation then
    null;
end $$;

select public.assert_password_strength('long-secret-ok');

reset role;
do $$
begin
  if exists (select 1 from auth.sessions where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') then
    raise exception 'password action left a session';
  end if;
  if exists (
    select 1 from public.audit_logs
    where action = 'user.password_reset'
      and (
        new_values::text ilike '%secretpasswordvalue%'
        or new_values::text ilike '%tiny-pw%'
        or new_values::text ilike '%long-secret-ok%'
      )
  ) then
    raise exception 'password value was written to audit';
  end if;
end $$;

set role app_tester;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}', false);
do $$
begin
  if (select must_change_password from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') is not true then
    raise exception 'temporary password did not force a change';
  end if;
end $$;

-- Profile completion stores the encrypted payload, never the national id digits.
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', false);
select public.complete_password_change();
select public.complete_own_profile(
  'مندوب مبيعات',
  '01012345678',
  'المعادي، القاهرة',
  'payload.not.the.id',
  'abc123hash',
  '29**********11'
);

do $$
begin
  if exists (
    select 1
    from public.employee_private_data
    where national_id_encrypted like '%29001010100011%'
      or national_id_hash like '%29001010100011%'
      or phone like '%29001010100011%'
  ) then
    raise exception 'national id digits were stored';
  end if;
  if not (select profile_completed from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') then
    raise exception 'profile was not completed';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', false);
