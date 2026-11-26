-- Auth stores emails lowercased. Mixed-case rows in account_provisions
-- make handle_new_user fail with "Database error creating new user".

create or replace function private.normalize_provision_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(new.email::text)::public.citext;
  return new;
end;
$$;

drop trigger if exists account_provisions_normalize_email on public.account_provisions;
create trigger account_provisions_normalize_email
before insert or update of email on public.account_provisions
for each row execute function private.normalize_provision_email();

update public.account_provisions
set email = lower(email::text)::public.citext
where email::text <> lower(email::text);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provision public.account_provisions;
  normalized public.citext := lower(new.email)::public.citext;
begin
  select * into provision
  from public.account_provisions
  where email = normalized
    and consumed_at is null;

  if not found then
    raise exception 'signup_not_provisioned' using errcode = '42501';
  end if;

  insert into public.profiles (id, email, status, must_change_password, created_by)
  values (new.id, normalized, 'active', provision.must_change_password, provision.created_by);

  insert into public.user_roles (user_id, role, assigned_by)
  values (new.id, provision.role, provision.created_by);

  update public.account_provisions
  set consumed_at = now()
  where email = provision.email;

  return new;
end;
$$;
