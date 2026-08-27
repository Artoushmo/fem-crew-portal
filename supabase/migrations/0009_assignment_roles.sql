-- One shoot, several people.
--
-- Until now an assignment was a job for exactly one freelancer, so a product
-- launch needing a photographer, a videographer and a drone operator had to be
-- entered three times: three briefings to keep in step, three venues to correct
-- when the client moves the call, and nothing in the system saying they were
-- the same day's work.
--
-- The shape that fits: the assignment is the shoot -- client, date, place,
-- briefing, delivery, everything the whole crew shares -- and a role is one
-- person on it. Fee, progress and invoicing live on the role, because they are
-- per person: the photographer can be paid while the drone operator has not
-- delivered.
--
-- Done now on purpose. The freelancer's screens still run on sample data, so
-- this is the last moment it costs only a migration.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table public.assignment_roles (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments(id) on delete cascade,

  -- What is wanted, and what it says on the call sheet. The craft is what we
  -- match and count on; the label is what a person reads.
  craft          public.craft not null,
  role_label     text not null,

  -- Null until someone is booked. That is the whole point of the Needs crew
  -- list, so it must be a real state and not an empty string.
  freelancer_id  uuid references public.profiles(id) on delete restrict,

  fee_cents      integer not null default 0 check (fee_cents >= 0),

  status         public.assignment_status not null default 'action-required',
  stage          smallint not null default 0 check (stage between 0 and 6),
  stage_dates    jsonb not null default '{}'::jsonb,

  payment_state  public.payment_state not null default 'not-invoiced',
  invoice_number text,
  invoiced_on    date,
  paid_on        date,

  -- Offered is the moment it appears on their dashboard. Accepted is the moment
  -- FEM can stop looking for someone else.
  offered_at     timestamptz,
  accepted_at    timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- The same person twice on one shoot is a booking mistake, not a crew of two.
  unique (assignment_id, freelancer_id)
);

create index assignment_roles_assignment_idx on public.assignment_roles (assignment_id);
create index assignment_roles_freelancer_idx on public.assignment_roles (freelancer_id);
create index assignment_roles_open_idx on public.assignment_roles (craft) where freelancer_id is null;

comment on column public.assignment_roles.offered_at is
  'Set when the role is offered. Until then the freelancer cannot see the shoot.';

-- ---------------------------------------------------------------------------
-- Carry the existing rows over
-- ---------------------------------------------------------------------------

-- Every assignment becomes a shoot with one role, so nothing that was already
-- entered is lost or silently unbooked.
insert into public.assignment_roles (
  assignment_id, craft, role_label, freelancer_id, fee_cents,
  status, stage, stage_dates, payment_state, invoice_number, invoiced_on, paid_on,
  offered_at, created_at
)
select
  a.id,
  coalesce(a.required_craft, 'photographer'::public.craft),
  a.role,
  a.freelancer_id,
  a.fee_cents,
  a.status,
  a.stage,
  a.stage_dates,
  a.payment_state,
  a.invoice_number,
  a.invoiced_on,
  a.paid_on,
  a.published_at,
  a.created_at
from public.assignments a;

-- ---------------------------------------------------------------------------
-- Strip the shoot of what belongs to a person
-- ---------------------------------------------------------------------------

-- Two places holding a fee is one place too many: they drift, and then nobody
-- knows which one the invoice was written from.
drop policy if exists "freelancer reads own assignments" on public.assignments;
drop policy if exists "freelancer advances own assignment" on public.assignments;
drop policy if exists "read files for own assignments" on public.assignment_files;

alter table public.assignments
  drop column freelancer_id,
  drop column fee_cents,
  drop column status,
  drop column stage,
  drop column stage_dates,
  drop column payment_state,
  drop column invoice_number,
  drop column invoiced_on,
  drop column paid_on,
  drop column required_craft,
  drop column role,
  drop column crew;

-- published_at said "this shoot has been offered". Offering is per role now.
alter table public.assignments drop column published_at;

-- ---------------------------------------------------------------------------
-- Who may see and change what
-- ---------------------------------------------------------------------------

alter table public.assignment_roles enable row level security;

grant select, insert, update, delete on public.assignment_roles to authenticated;

create policy "staff manage roles"
  on public.assignment_roles for all
  to authenticated
  using (app.is_staff())
  with check (app.is_staff());

-- A freelancer sees their own role, and only once it has been offered. An
-- unoffered booking is FEM thinking out loud.
create policy "freelancer reads own role"
  on public.assignment_roles for select
  to authenticated
  using (
    freelancer_id = auth.uid()
    and offered_at is not null
    and app.mfa_satisfied()
  );

create policy "freelancer advances own role"
  on public.assignment_roles for update
  to authenticated
  using (
    freelancer_id = auth.uid()
    and offered_at is not null
    and app.mfa_satisfied()
  )
  with check (freelancer_id = auth.uid());

-- The shoot itself is readable to anyone booked on it, once offered. This is
-- what puts the briefing, the venue and the call times on their screen.
create policy "freelancer reads booked shoots"
  on public.assignments for select
  to authenticated
  using (
    app.mfa_satisfied()
    and exists (
      select 1 from public.assignment_roles r
      where r.assignment_id = assignments.id
        and r.freelancer_id = auth.uid()
        and r.offered_at is not null
    )
  );

create policy "read files for booked shoots"
  on public.assignment_files for select
  to authenticated
  using (
    app.is_staff()
    or exists (
      select 1 from public.assignment_roles r
      where r.assignment_id = assignment_files.assignment_id
        and r.freelancer_id = auth.uid()
        and r.offered_at is not null
        and app.mfa_satisfied()
    )
  );

-- ---------------------------------------------------------------------------
-- The guard, moved to where the person now lives
-- ---------------------------------------------------------------------------

-- The old trigger pinned columns on assignments that a freelancer could reach.
-- They cannot reach that table for writing at all any more, so the guard moves
-- to the role -- the only row they may change.
drop trigger if exists guard_assignment_update on public.assignments;

create or replace function app.guard_role_update()
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

  -- Everything FEM owns is pinned to its previous value. A freelancer moves
  -- their own progress and nothing else.
  new.assignment_id := old.assignment_id;
  new.freelancer_id := old.freelancer_id;
  new.craft         := old.craft;
  new.role_label    := old.role_label;
  new.fee_cents     := old.fee_cents;
  new.offered_at    := old.offered_at;
  new.paid_on       := old.paid_on;

  if new.payment_state = 'paid' and old.payment_state <> 'paid' then
    raise exception 'only FEM can confirm payment';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- The guard already stamps updated_at on both paths, so no separate touch
-- trigger here -- two triggers writing one column is a race waiting to be
-- debugged.
create trigger guard_role_update
  before update on public.assignment_roles
  for each row execute function app.guard_role_update();
