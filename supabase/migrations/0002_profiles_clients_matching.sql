-- FEM Crew Portal — freelancer profiles, clients, and the links between them.
--
-- 0001 modelled one assignment belonging to one freelancer, with the client as a
-- loose string. That cannot support the other half of the process: FEM creating
-- an assignment first, then choosing who fits it. This migration makes the
-- freelancer optional, gives clients a table of their own, and records what a
-- freelancer can actually do so a match can be made on more than a hunch.

-- ---------------------------------------------------------------------------
-- Freelancer profile
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column phone            text,
  add column avatar_path      text,
  add column base_city        text,
  add column country          text not null default 'NL',
  add column bio              text,
  add column travel_radius_km integer check (travel_radius_km between 0 and 2000),
  add column notice_hours     integer check (notice_hours >= 0),
  add column company_name     text,
  add column coc_number       text,
  add column vat_number       text,
  add column iban             text,
  add column onboarded_at     timestamptz,
  add column updated_at       timestamptz not null default now();

comment on column public.profiles.notice_hours is
  'How much warning this freelancer needs before a shoot.';
comment on column public.profiles.iban is
  'Payment detail. Readable only by the owner and by staff at aal2 — see policies.';

-- What someone is hired as. Kept separate from the free-text role on an
-- assignment so matching can be exact rather than string comparison.
create type public.craft as enum (
  'photographer',
  'videographer',
  'drone-operator',
  'editor',
  'assistant',
  'lighting',
  'audio'
);

create table public.freelancer_crafts (
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  craft            public.craft not null,
  is_primary       boolean not null default false,
  years_experience smallint check (years_experience between 0 and 60),
  primary key (profile_id, craft)
);

-- Only one primary craft per person.
create unique index freelancer_primary_craft_idx
  on public.freelancer_crafts (profile_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- Equipment
-- ---------------------------------------------------------------------------

create type public.gear_category as enum (
  'camera',
  'lens',
  'lighting',
  'audio',
  'drone',
  'support',
  'other'
);

create table public.gear (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category   public.gear_category not null,
  brand      text,
  model      text not null,
  quantity   smallint not null default 1 check (quantity > 0),
  notes      text,
  created_at timestamptz not null default now()
);

create index gear_profile_idx on public.gear (profile_id, category);

-- ---------------------------------------------------------------------------
-- Licences and insurance
-- ---------------------------------------------------------------------------

create type public.credential_kind as enum (
  'drone-licence',
  'insurance',
  'certification',
  'other'
);

create table public.credentials (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  kind          public.credential_kind not null,
  label         text not null,
  reference     text,
  issued_on     date,
  expires_on    date,
  document_path text,
  created_at    timestamptz not null default now()
);

create index credentials_profile_idx on public.credentials (profile_id, expires_on);

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------

create type public.availability_kind as enum ('unavailable', 'preferred');

create table public.availability (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind       public.availability_kind not null default 'unavailable',
  starts_on  date not null,
  ends_on    date not null,
  note       text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index availability_profile_idx on public.availability (profile_id, starts_on);

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  contact_email text,
  contact_phone text,
  address       text,
  city          text,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index clients_name_idx on public.clients (lower(name));

-- ---------------------------------------------------------------------------
-- Assignments: optional freelancer, real client, named producer
-- ---------------------------------------------------------------------------

-- An assignment now exists before anyone is booked onto it.
alter table public.assignments alter column freelancer_id drop not null;

alter table public.assignments
  add column client_id      uuid references public.clients(id) on delete restrict,
  add column producer_id    uuid references public.profiles(id) on delete set null,
  add column required_craft public.craft,
  add column created_by     uuid references public.profiles(id) on delete set null,
  add column published_at   timestamptz;

-- The client is a row now, and the producer is a profile: both carry their own
-- contact details, so the loose copies on the assignment go.
alter table public.assignments drop column client;
alter table public.assignments drop column contact;

create index assignments_client_idx on public.assignments (client_id, starts_at desc);
create index assignments_open_idx
  on public.assignments (required_craft, starts_at)
  where freelancer_id is null;

comment on column public.assignments.published_at is
  'Set when FEM offers the assignment to the booked freelancer. Until then it is a draft only staff can see.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.freelancer_crafts enable row level security;
alter table public.gear             enable row level security;
alter table public.credentials      enable row level security;
alter table public.availability     enable row level security;
alter table public.clients          enable row level security;

-- Owner writes their own; staff read everyone's. Same shape for all four
-- profile-owned tables.
do $$
declare t text;
begin
  foreach t in array array['freelancer_crafts', 'gear', 'credentials', 'availability']
  loop
    execute format($f$
      grant select, insert, update, delete on public.%I to authenticated;

      create policy "own rows" on public.%I
        for all to authenticated
        using (profile_id = auth.uid() and app.mfa_satisfied())
        with check (profile_id = auth.uid());

      create policy "staff read all" on public.%I
        for select to authenticated
        using (app.is_staff());
    $f$, t, t, t);
  end loop;
end $$;

-- Clients are FEM's own records. A freelancer never queries this table; the
-- client's name reaches them through the assignment they are booked on.
grant select, insert, update, delete on public.clients to authenticated;

create policy "staff manage clients"
  on public.clients for all
  to authenticated
  using (app.is_staff())
  with check (app.is_staff());

-- Staff may create and edit assignments, which 0001 did not allow.
create policy "staff manage assignments"
  on public.assignments for all
  to authenticated
  using (app.is_staff())
  with check (app.is_staff());

-- A freelancer only sees an assignment once it has been offered to them.
drop policy "freelancer reads own assignments" on public.assignments;

create policy "freelancer reads own assignments"
  on public.assignments for select
  to authenticated
  using (
    freelancer_id = auth.uid()
    and published_at is not null
    and app.mfa_satisfied()
  );

-- Staff may edit any profile's contact details; role stays out of reach for
-- everyone, since the column grant from 0001 covers full_name only.
grant update (
  full_name, phone, avatar_path, base_city, country, bio,
  travel_radius_km, notice_hours, company_name, coc_number, vat_number, iban
) on public.profiles to authenticated;

create policy "staff update profiles"
  on public.profiles for update
  to authenticated
  using (app.is_staff())
  with check (app.is_staff());

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Avatars are public: the path is an unguessable uuid, and a signed URL that
-- expires would have to be refreshed on every render for a picture that is not
-- sensitive. Credentials are the opposite — licences and insurance certificates
-- stay private and are reached through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('credentials', 'credentials', false)
on conflict (id) do nothing;

-- Everyone writes only into a folder named after their own user id.
create policy "own avatar write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own avatar update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own avatar delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own credentials read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'credentials'
    and ((storage.foldername(name))[1] = auth.uid()::text or app.is_staff())
  );

create policy "own credentials write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own credentials delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Rewrite the update guard
-- ---------------------------------------------------------------------------

-- The 0001 version pinned `client`, which no longer exists — plpgsql resolves
-- columns at run time, so the drop above would leave a trigger that throws on
-- every freelancer update. Same guarantees, current columns.
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
  new.client_id      := old.client_id;
  new.producer_id    := old.producer_id;
  new.required_craft := old.required_craft;
  new.published_at   := old.published_at;
  new.fee_cents      := old.fee_cents;
  new.title          := old.title;
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

-- ---------------------------------------------------------------------------
-- Keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function app.touch_updated_at();

create trigger clients_touch
  before update on public.clients
  for each row execute function app.touch_updated_at();
