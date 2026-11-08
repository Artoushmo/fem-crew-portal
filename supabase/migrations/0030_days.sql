-- A job can take more than a day.
--
-- A two-day conference was two jobs in the portal: two bookings, two accepts,
-- two invoices, and a team list that could not say "Timati is Wednesday
-- only". The alternative was one job with the second day written into the
-- briefing and hoped for.
--
-- So a job has days. Each day has its own times, and each person on the job
-- is on all of them unless a day says otherwise -- not present, or present at
-- other hours. Nothing is stored where it would equal the default, so a job
-- with one day and everyone at the same hours is exactly what it was before.
--
-- The job's own on_site / camera_ready / wrapped stay as the defaults a day
-- inherits, and starts_at stays as what the lists sort by: it is kept equal to
-- the first day by trigger rather than trusted to the client.

create table public.assignment_days (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  day           date not null,
  -- Null means the job's times.
  on_site       time,
  camera_ready  time,
  wrapped       time,
  -- "Build day", "Conference", "Strike". What the call sheet calls it.
  note          text,
  created_at    timestamptz not null default now(),
  unique (assignment_id, day)
);

create index assignment_days_assignment_idx on public.assignment_days (assignment_id, day);

comment on table public.assignment_days is
  'The days a job runs. A job without rows here is a deadline, not a shoot.';

-- One person, one day: there or not, and at what hours. A missing row means
-- present at the day's times, so most jobs never write one.
create table public.assignment_role_days (
  role_id  uuid not null references public.assignment_roles(id) on delete cascade,
  day_id   uuid not null references public.assignment_days(id) on delete cascade,
  present  boolean not null default true,
  on_site  time,
  wrapped  time,
  primary key (role_id, day_id)
);

comment on table public.assignment_role_days is
  'Where one person''s day differs from the job''s: not there, or there at other hours.';

-- ---------------------------------------------------------------------------
-- Who may read and write them
-- ---------------------------------------------------------------------------

alter table public.assignment_days enable row level security;
alter table public.assignment_role_days enable row level security;

grant select, insert, update, delete on public.assignment_days to authenticated;
grant select, insert, update, delete on public.assignment_role_days to authenticated;

create policy "staff manage days"
  on public.assignment_days for all
  to authenticated
  using (app.is_staff())
  with check (app.is_staff());

-- A freelancer sees the days of a job they have been offered. The team's
-- hours per day come through shoot_people, below.
create policy "crew read days of own jobs"
  on public.assignment_days for select
  to authenticated
  using (
    app.mfa_satisfied()
    and exists (
      select 1 from public.assignment_roles r
      where r.assignment_id = assignment_days.assignment_id
        and r.freelancer_id = auth.uid()
        and r.offered_at is not null
    )
  );

create policy "staff manage role days"
  on public.assignment_role_days for all
  to authenticated
  using (app.is_staff())
  with check (app.is_staff());

create policy "crew read own role days"
  on public.assignment_role_days for select
  to authenticated
  using (
    app.mfa_satisfied()
    and exists (
      select 1 from public.assignment_roles r
      where r.id = assignment_role_days.role_id
        and r.freelancer_id = auth.uid()
        and r.offered_at is not null
    )
  );

-- ---------------------------------------------------------------------------
-- What already exists becomes a one-day job
-- ---------------------------------------------------------------------------

-- Every shoot so far had one day: the date of starts_at, at the job's times.
-- Times stay null here so they keep following the job, as they always did.
-- Deadline-only jobs have no on_site and get no day.
insert into public.assignment_days (assignment_id, day)
select a.id, (a.starts_at at time zone 'Europe/Amsterdam')::date
from public.assignments a
where a.on_site is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The first day is what the job sorts by
-- ---------------------------------------------------------------------------

-- Kept by trigger, after the backfill above so that nothing is "changed" by
-- it. Deadline-only jobs have no days and keep the starts_at they were given.
create or replace function app.sync_starts_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job uuid := coalesce(new.assignment_id, old.assignment_id);
  first timestamptz;
begin
  select min((d.day + coalesce(d.on_site, a.on_site, time '09:00')) at time zone 'Europe/Amsterdam')
  into first
  from public.assignment_days d
  join public.assignments a on a.id = d.assignment_id
  where d.assignment_id = job;

  if first is not null then
    update public.assignments set starts_at = first
    where id = job and starts_at is distinct from first;
  end if;

  return null;
end;
$$;

create trigger sync_starts_at
  after insert or update or delete on public.assignment_days
  for each row execute function app.sync_starts_at();

-- A day added, dropped or moved is a change to publish, like a moved call
-- time. The job's own trigger picks up "the date" when starts_at shifts; this
-- covers the days that are not the first.
create or replace function app.note_day_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job uuid := coalesce(new.assignment_id, old.assignment_id);
  what text;
begin
  if tg_op <> 'UPDATE' or old.day is distinct from new.day then
    what := 'the dates';
  elsif old.on_site is distinct from new.on_site
     or old.camera_ready is distinct from new.camera_ready
     or old.wrapped is distinct from new.wrapped then
    what := 'the call times';
  else
    return null;
  end if;

  update public.assignments a
  set unpublished_changes = (
    select coalesce(array_agg(distinct x), '{}')
    from unnest(a.unpublished_changes || array[what]) as x
  )
  where a.id = job;

  return null;
end;
$$;

create trigger note_day_change
  after insert or update or delete on public.assignment_days
  for each row execute function app.note_day_change();

create or replace function app.note_role_day_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  role uuid := coalesce(new.role_id, old.role_id);
begin
  update public.assignments a
  set unpublished_changes = (
    select coalesce(array_agg(distinct x), '{}')
    from unnest(a.unpublished_changes || array['the call times']) as x
  )
  where a.id = (select r.assignment_id from public.assignment_roles r where r.id = role);

  return null;
end;
$$;

create trigger note_role_day_change
  after insert or update or delete on public.assignment_role_days
  for each row execute function app.note_role_day_change();

-- ---------------------------------------------------------------------------
-- Who is on it, per day
-- ---------------------------------------------------------------------------

drop function if exists public.shoot_people(uuid);

-- One row per person per day they are on, with the hours they are wanted that
-- day. A deadline-only job has no days and gives one row per person with no
-- day. The producer and the client have no day either.
create function public.shoot_people(shoot_id uuid)
returns table (
  kind       text,
  name       text,
  role_label text,
  day        date,
  on_site    time,
  wrapped    time,
  is_lead    boolean,
  is_you     boolean,
  phone      text,
  email      text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select
      app.is_staff() as staff,
      exists (
        select 1 from public.assignment_roles r
        where r.assignment_id = shoot_id
          and r.freelancer_id = auth.uid()
          and r.offered_at is not null
      ) as booked,
      exists (
        select 1 from public.assignment_roles r
        where r.assignment_id = shoot_id
          and r.freelancer_id = auth.uid()
          and r.offered_at is not null
          and r.is_lead
      ) as lead
  ),
  crew as (
    select r.id, r.role_label, r.is_lead, r.freelancer_id, r.on_site, r.wrapped,
           c.full_name, c.phone, c.email
    from public.assignment_roles r
    join public.profiles c on c.id = r.freelancer_id
    where r.assignment_id = shoot_id
      and r.freelancer_id is not null
      and r.offered_at is not null
  ),
  days as (
    select d.id, d.day, d.on_site, d.wrapped
    from public.assignment_days d
    where d.assignment_id = shoot_id
  )

  select
    'producer'::text,
    coalesce(p.full_name, 'Fast Elevate Media'),
    'Producer, FEM'::text,
    null::date, null::time, null::time,
    false, false,
    p.phone,
    p.email
  from public.assignments a
  join public.profiles p on p.id = a.producer_id
  where a.id = shoot_id and (select staff or booked from me)

  union all

  -- Per day. Hours: the person's for that day, else the person's for the
  -- job, else the day's, else the job's.
  select
    'crew'::text,
    coalesce(cr.full_name, 'Crew'),
    cr.role_label,
    d.day,
    coalesce(rd.on_site, cr.on_site, d.on_site, a.on_site),
    coalesce(rd.wrapped, cr.wrapped, d.wrapped, a.wrapped),
    cr.is_lead,
    cr.freelancer_id = auth.uid(),
    case when (select staff or lead from me) then cr.phone end,
    case when (select staff or lead from me) then cr.email end
  from crew cr
  cross join days d
  join public.assignments a on a.id = shoot_id
  left join public.assignment_role_days rd on rd.role_id = cr.id and rd.day_id = d.id
  where coalesce(rd.present, true)
    and (select staff or booked from me)

  union all

  -- No days: a deadline job. Everyone once, no hours.
  select
    'crew'::text,
    coalesce(cr.full_name, 'Crew'),
    cr.role_label,
    null::date, null::time, null::time,
    cr.is_lead,
    cr.freelancer_id = auth.uid(),
    case when (select staff or lead from me) then cr.phone end,
    case when (select staff or lead from me) then cr.email end
  from crew cr
  where not exists (select 1 from days)
    and (select staff or booked from me)

  union all

  select
    'client'::text,
    coalesce(cl.contact_name, cl.name),
    cl.name,
    null::date, null::time, null::time,
    false, false,
    cl.contact_phone,
    cl.contact_email
  from public.assignments a
  join public.clients cl on cl.id = a.client_id
  where a.id = shoot_id
    and cl.contact_name is not null
    and (select staff or lead from me);
$$;

revoke all on function public.shoot_people(uuid) from public, anon;
grant execute on function public.shoot_people(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- What a message says about the days
-- ---------------------------------------------------------------------------

create or replace function app.job_payload(role_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'role_id',     r.id,
    'title',       a.title,
    'client',      coalesce(c.name, 'Fast Elevate Media'),
    'role_label',  r.role_label,
    'is_lead',     r.is_lead,
    'starts_at',   a.starts_at,
    'due_on',      coalesce(r.due_on, a.due_on),
    'on_site',     coalesce(r.on_site, a.on_site),
    'wrapped',     coalesce(r.wrapped, a.wrapped),
    'city',        a.city,
    'venue',       a.venue,
    'fee_cents',   r.fee_cents,
    'freelancer',  p.full_name,
    -- This person's days, in order, with their hours. Empty for a deadline.
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day',     d.day,
        'on_site', coalesce(rd.on_site, r.on_site, d.on_site, a.on_site),
        'wrapped', coalesce(rd.wrapped, r.wrapped, d.wrapped, a.wrapped),
        'note',    d.note
      ) order by d.day)
      from public.assignment_days d
      left join public.assignment_role_days rd on rd.role_id = r.id and rd.day_id = d.id
      where d.assignment_id = a.id and coalesce(rd.present, true)
    ), '[]'::jsonb)
  )
  from public.assignment_roles r
  join public.assignments a on a.id = r.assignment_id
  left join public.clients c on c.id = a.client_id
  left join public.profiles p on p.id = r.freelancer_id
  where r.id = role_id;
$$;
