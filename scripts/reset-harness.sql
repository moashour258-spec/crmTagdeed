-- Local PostgreSQL stand-in for the Supabase auth schema. Not applied on hosted Supabase.
drop schema if exists public cascade;
drop schema if exists private cascade;
drop schema if exists storage cascade;
create schema public;
grant all on schema public to postgres;
grant usage on schema public to public;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

truncate table auth.users;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(
        case
          when nullif(current_setting('request.jwt.claims', true), '') is null then null
          else current_setting('request.jwt.claims', true)::json ->> 'sub'
        end,
        ''
      )
    ),
    ''
  )::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_tester') then
    create role app_tester login nosuperuser;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname in ('expire-reservations', 'delivery-digest', 'overdue-installments');
  end if;
exception when others then
  raise notice 'cron cleanup skipped: %', sqlerrm;
end $$;
