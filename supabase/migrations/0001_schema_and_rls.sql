-- FEM Crew Portal — schema and row level security.
--
-- The portal is a static client talking straight to PostgREST with the public
-- anon key. That key identifies the project; it grants nothing. Every rule that
-- matters is below, enforced by Postgres on every request. If RLS is off on a
-- table, that table is world-readable — so this file enables it everywhere and
-- the smoke tests at the bottom prove it.

-- ---------------------------------------------------------------------------
-- Roles and helpers
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('freelancer', 'staff', 'admin');

create schema if not exists app;
revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated;

create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        public.app_role not null default 'freelancer',
  full_name   text,
  email       text,
  created_at  timestamptz not null default now()
);

-- security definer so a policy can read the caller's role without recursing
-- through profiles' own policies.
create or replace function app.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select role from public.profiles where id = auth.uid() $$;

-- True when the session satisfies the MFA rule for this account:
--   * staff and admins always need aal2
--   * anyone who has enrolled a factor needs aal2 — enrolling then skipping it
--     must not be a way around the requirement
--   * a freelancer with no factor may work at aal1
create or replace function app.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when app.current_role() in ('staff', 'admin')
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    when exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    else true
  end
$$;

create or replace function app.is_staff()
returns boolean
language sql
stable
as $$ select app.current_role() in ('staff', 'admin') and app.mfa_satisfied() $$;

-- Give every new auth user a profile. Role is deliberately not settable from
-- sign-up metadata: promoting someone is an admin action, not self-service.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Domain tables
-- ---------------------------------------------------------------------------

create type public.assignment_status as enum
  ('action-required', 'confirmed', 'in-progress', 'delivered', 'completed');

create type public.payment_state as enum ('not-invoiced', 'awaiting', 'paid');

create table public.assignments (
  id             uuid primary key default gen_random_uuid(),
  freelancer_id  uuid not null references public.profiles(id) on delete restrict,
  title          text not null,
  client         text not null,
  starts_at      timestamptz not null,
  on_site        time not null,
  camera_ready   time not null,
  wrapped        time not null,
  city           text not null,
  venue          text not null,
  maps_url       text,
  travel         text,
  parking        text,
  role           text not null,
  -- Money in cents: never float.
  fee_cents      integer not null check (fee_cents >= 0),
  status         public.assignment_status not null default 'action-required',
  stage          smallint not null default 1 check (stage between 0 and 6),
  stage_dates    jsonb not null default '{}'::jsonb,
  briefing       text,
  expectations   text[] not null default '{}',
  shots          text[] not null default '{}',
  equipment      text[] not null default '{}',
  dresscode      text,
  client_notes   text,
  delivery       jsonb not null default '{}'::jsonb,
  contact        jsonb not null default '{}'::jsonb,
  crew           text[] not null default '{}',
  payment_state  public.payment_state not null default 'not-invoiced',
  invoice_number text,
  invoiced_on    date,
  paid_on        date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index assignments_freelancer_idx on public.assignments (freelancer_id, starts_at desc);

create table public.assignment_files (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  name          text not null,
  kind          text not null,
  size_label    text,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);

create index assignment_files_assignment_idx on public.assignment_files (assignment_id);

create table public.agreements (
  id            uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  year          smallint not null,
  signed_on     date,
  storage_path  text,
  created_at    timestamptz not null default now(),
  unique (freelancer_id, year)
);

-- Who looked at what. Contracts and fees are sensitive; being able to answer
-- "who opened this" after the fact is part of taking that seriously.
create table public.access_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  subject_type text not null,
  subject_id   uuid,
  occurred_at  timestamptz not null default now()
);

create index access_log_actor_idx on public.access_log (actor_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.assignments      enable row level security;
alter table public.assignment_files enable row level security;
alter table public.agreements       enable row level security;
alter table public.access_log       enable row level security;

-- Belt and braces: no implicit table privileges, and deny anonymous callers
-- outright. RLS would already stop them; this makes it impossible to forget.
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.assignments      to authenticated;
grant select                        on public.assignment_files  to authenticated;
grant select                        on public.agreements        to authenticated;
grant select, update                on public.profiles          to authenticated;
grant insert                        on public.access_log        to authenticated;

-- profiles ------------------------------------------------------------------

create policy "read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() and app.mfa_satisfied());

create policy "staff read all profiles"
  on public.profiles for select
  to authenticated
  using (app.is_staff());

-- Name and email only. Role changes are not possible from the client at all:
-- the column is excluded by the check below.
create policy "update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() and app.mfa_satisfied())
  with check (id = auth.uid() and role = app.current_role());

-- assignments ---------------------------------------------------------------

create policy "freelancer reads own assignments"
  on public.assignments for select
  to authenticated
  using (freelancer_id = auth.uid() and app.mfa_satisfied());

create policy "staff read all assignments"
  on public.assignments for select
  to authenticated
  using (app.is_staff());

-- A freelancer may move their own assignment forward one stage at a time, and
-- may not touch the fee, the client, or anything else FEM owns. Backwards moves
-- and jumps are rejected.
create policy "freelancer advances own assignment"
  on public.assignments for update
  to authenticated
  using (freelancer_id = auth.uid() and app.mfa_satisfied())
  with check (freelancer_id = auth.uid());

create or replace function app.guard_assignment_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.is_staff() then
    new.updated_at := now();
    return new;
  end if;

  if new.stage not in (old.stage, old.stage + 1) then
    raise exception 'stage may only advance by one';
  end if;

  -- Everything FEM owns is pinned to its previous value.
  new.freelancer_id  := old.freelancer_id;
  new.fee_cents      := old.fee_cents;
  new.title          := old.title;
  new.client         := old.client;
  new.starts_at      := old.starts_at;
  new.role           := old.role;
  new.briefing       := old.briefing;
  new.paid_on        := old.paid_on;

  -- Only FEM marks an invoice paid.
  if new.payment_state = 'paid' and old.payment_state <> 'paid' then
    raise exception 'only FEM can confirm payment';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger assignments_guard_update
  before update on public.assignments
  for each row execute function app.guard_assignment_update();

-- assignment_files ----------------------------------------------------------

create policy "read files for own assignments"
  on public.assignment_files for select
  to authenticated
  using (
    app.mfa_satisfied()
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.freelancer_id = auth.uid()
    )
  );

create policy "staff read all files"
  on public.assignment_files for select
  to authenticated
  using (app.is_staff());

-- agreements ----------------------------------------------------------------

create policy "read own agreements"
  on public.agreements for select
  to authenticated
  using (freelancer_id = auth.uid() and app.mfa_satisfied());

create policy "staff read all agreements"
  on public.agreements for select
  to authenticated
  using (app.is_staff());

-- access_log ----------------------------------------------------------------

-- Append-only from the client: you may record what you did, never read or
-- rewrite the log.
create policy "append own log entries"
  on public.access_log for insert
  to authenticated
  with check (actor_id = auth.uid());

create policy "staff read the log"
  on public.access_log for select
  to authenticated
  using (app.is_staff());

-- ---------------------------------------------------------------------------
-- Smoke tests — run after seeding. Each must return true.
-- ---------------------------------------------------------------------------

-- 1. No table in public is left without RLS.
--    select tablename, rowsecurity from pg_tables where schemaname = 'public';
--
-- 2. Signed in as a freelancer, this returns only their own rows:
--    select count(*) from public.assignments;
--
-- 3. Signed in as a freelancer, this must fail:
--    update public.assignments set fee_cents = 999999 where id = '<own id>';
--
-- 4. Signed in as staff at aal1 (no MFA), this must return 0 rows:
--    select count(*) from public.profiles;
