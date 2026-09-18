-- One shoot, different jobs.
--
-- A reel is due the next morning and the stills three days later. The
-- videographer is wanted from eight and the photographer from half twelve. The
-- drone operator has a briefing the other two do not need.
--
-- All of that lived on the assignment, which meant one set of times and one
-- briefing for everyone on it, and the difference had to be written into the
-- shared text and hoped for.
--
-- So a role may carry its own. Null means "the same as the job" rather than
-- "nothing": a producer sets what differs and leaves the rest alone, and
-- changing the job still moves everyone who did not need something else.

alter table public.assignment_roles
  -- When this person is wanted, if not when everyone else is.
  add column on_site      time,
  add column camera_ready time,
  add column wrapped      time,

  -- What this person owes, and when. Separate from the shoot day: the reel is
  -- due the morning after, the stills that Friday.
  add column due_on       date,

  -- What only this person needs to read.
  add column briefing     text,
  add column expectations text[],
  add column shots        text[],
  add column equipment    text[],
  add column delivery     jsonb;

comment on column public.assignment_roles.due_on is
  'This role''s own deadline. Null means the job''s.';

comment on column public.assignment_roles.briefing is
  'Overrides the job briefing for this person. Null means they read the job''s.';

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------

-- These are FEM's to set, like the fee and the date. A freelancer moves their
-- own progress and nothing about what was agreed.
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

  if new.stage not in (old.stage - 1, old.stage, old.stage + 1) then
    raise exception 'stage may only move one step at a time';
  end if;

  if new.stage < old.stage and old.stage = 1 then
    raise exception 'Accepting cannot be undone. Ask your producer.';
  end if;

  new.assignment_id := old.assignment_id;
  new.freelancer_id := old.freelancer_id;
  new.craft         := old.craft;
  new.role_label    := old.role_label;
  new.fee_cents     := old.fee_cents;
  new.offered_at    := old.offered_at;
  new.paid_on       := old.paid_on;

  new.on_site       := old.on_site;
  new.camera_ready  := old.camera_ready;
  new.wrapped       := old.wrapped;
  new.due_on        := old.due_on;
  new.briefing      := old.briefing;
  new.expectations  := old.expectations;
  new.shots         := old.shots;
  new.equipment     := old.equipment;
  new.delivery      := old.delivery;

  if new.payment_state = 'paid' and old.payment_state <> 'paid' then
    raise exception 'only FEM can confirm payment';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A moved call time still has to reach the right people
-- ---------------------------------------------------------------------------

-- Changing the job's times matters to everyone who was following them. Someone
-- with their own times is not affected, and telling them otherwise is how a
-- notification stops being read.
create or replace function app.notify_job_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  what text[] := '{}';
  times_changed boolean := false;
begin
  if old.starts_at is distinct from new.starts_at then
    what := array_append(what, 'the date');
    times_changed := true;
  end if;
  if old.on_site is distinct from new.on_site or old.wrapped is distinct from new.wrapped then
    what := array_append(what, 'the call times');
    times_changed := true;
  end if;
  if old.venue is distinct from new.venue or old.city is distinct from new.city then
    what := array_append(what, 'the location');
  end if;
  if old.due_on is distinct from new.due_on then
    what := array_append(what, 'the deadline');
  end if;

  if array_length(what, 1) is null then return new; end if;

  for r in
    select id, freelancer_id, on_site
    from public.assignment_roles
    where assignment_id = new.id and freelancer_id is not null and offered_at is not null
  loop
    -- Times they do not follow are not news to them.
    if times_changed and r.on_site is not null
       and old.venue is not distinct from new.venue
       and old.city is not distinct from new.city
       and old.due_on is not distinct from new.due_on then
      continue;
    end if;

    perform app.queue(r.freelancer_id, 'job-changed',
      app.job_payload(r.id) || jsonb_build_object('changed', array_to_string(what, ', ')));
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a message says about the job
-- ---------------------------------------------------------------------------

-- The email should quote this person's times, not the job's, or a videographer
-- called in at eight reads half twelve and arrives late.
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
    'starts_at',   a.starts_at,
    'due_on',      coalesce(r.due_on, a.due_on),
    'on_site',     coalesce(r.on_site, a.on_site),
    'wrapped',     coalesce(r.wrapped, a.wrapped),
    'city',        a.city,
    'venue',       a.venue,
    'fee_cents',   r.fee_cents,
    'freelancer',  p.full_name
  )
  from public.assignment_roles r
  join public.assignments a on a.id = r.assignment_id
  left join public.clients c on c.id = a.client_id
  left join public.profiles p on p.id = r.freelancer_id
  where r.id = role_id;
$$;
