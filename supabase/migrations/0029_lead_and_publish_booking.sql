-- Picking is not telling, and somebody has to be in charge.
--
-- Two things from the same briefing.
--
-- First: choosing a freelancer in Find someone mailed them on the spot, with
-- everything -- before the producer had finished the roles, let alone decided
-- the job was ready to go out. Picking somebody is now internal, like every
-- other edit; the booking goes out when the job is published, in the same
-- message as everything else. Until then the role is theirs on paper and they
-- know nothing about it.
--
-- Second: on a bigger job one person on site holds the overview -- collects
-- the data, talks to the client, keeps the others to time. That person needs
-- to know who the client is and how to reach everyone. Nobody else does.

-- ---------------------------------------------------------------------------
-- The lead
-- ---------------------------------------------------------------------------

alter table public.assignment_roles
  add column is_lead boolean not null default false;

comment on column public.assignment_roles.is_lead is
  'Point of contact on site. Sees the client contact and the whole team''s details. One per job.';

create unique index assignment_roles_one_lead
  on public.assignment_roles (assignment_id)
  where is_lead;

-- Theirs to carry, not theirs to take.
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
  new.reminded_at   := old.reminded_at;
  new.is_lead       := old.is_lead;

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
-- Who is on it, and what each of them may see
-- ---------------------------------------------------------------------------

-- The return type gains columns, which Postgres will not do in place.
drop function if exists public.shoot_people(uuid);

-- Everyone booked sees who else is coming and when: that is how a team plans
-- a day. Phone numbers and the client are for the lead and for FEM, because a
-- freelancer ringing the client about money is exactly what a lead is there
-- to prevent.
create function public.shoot_people(shoot_id uuid)
returns table (
  kind       text,
  name       text,
  role_label text,
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
  )

  -- The producer: always reachable.
  select
    'producer'::text,
    coalesce(p.full_name, 'Fast Elevate Media'),
    'Producer, FEM'::text,
    null::time, null::time,
    false, false,
    p.phone,
    p.email
  from public.assignments a
  join public.profiles p on p.id = a.producer_id
  where a.id = shoot_id and (select staff or booked from me)

  union all

  -- The crew, yourself included, with the hours each is wanted. Times fall
  -- back to the job's, the same way the call sheet does.
  select
    'crew'::text,
    coalesce(c.full_name, 'Crew'),
    r.role_label,
    coalesce(r.on_site, a.on_site),
    coalesce(r.wrapped, a.wrapped),
    r.is_lead,
    r.freelancer_id = auth.uid(),
    case when (select staff or lead from me) then c.phone end,
    case when (select staff or lead from me) then c.email end
  from public.assignment_roles r
  join public.assignments a on a.id = r.assignment_id
  join public.profiles c on c.id = r.freelancer_id
  where r.assignment_id = shoot_id
    and r.freelancer_id is not null
    and r.offered_at is not null
    and (select staff or booked from me)

  union all

  -- The client's contact: lead and FEM only.
  select
    'client'::text,
    coalesce(cl.contact_name, cl.name),
    cl.name,
    null::time, null::time,
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

-- The mail says LEAD where the briefing does.
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
    'freelancer',  p.full_name
  )
  from public.assignment_roles r
  join public.assignments a on a.id = r.assignment_id
  left join public.clients c on c.id = a.client_id
  left join public.profiles p on p.id = r.freelancer_id
  where r.id = role_id;
$$;

-- ---------------------------------------------------------------------------
-- Booking goes out when the job does
-- ---------------------------------------------------------------------------

-- Booked fires on offered_at, not on freelancer_id: picking somebody no longer
-- sets offered_at, publishing does. Unbooked only goes to somebody who had
-- actually been told.
create or replace function app.notify_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  producer uuid;
begin
  select a.producer_id into producer
  from public.assignments a where a.id = new.assignment_id;

  if new.freelancer_id is not null
     and new.offered_at is not null
     and (tg_op = 'INSERT' or old.offered_at is null
          or old.freelancer_id is distinct from new.freelancer_id) then
    perform app.queue(new.freelancer_id, 'booked', app.job_payload(new.id));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.freelancer_id is not null and new.freelancer_id is null
       and old.offered_at is not null then
      perform app.queue(old.freelancer_id, 'unbooked', app.job_payload(new.id));
      return new;
    end if;

    if old.accepted_at is null and new.accepted_at is not null and producer is not null then
      perform app.queue(producer, 'accepted', app.job_payload(new.id));
    end if;

    if old.stage < 4 and new.stage >= 4 and producer is not null then
      perform app.queue(producer, 'delivered',
        app.job_payload(new.id) || jsonb_build_object('link', new.delivery_link));
    end if;

    if old.payment_state <> 'awaiting' and new.payment_state = 'awaiting'
       and producer is not null then
      perform app.queue(producer, 'invoiced',
        app.job_payload(new.id) || jsonb_build_object('invoice', new.invoice_number));
    end if;

    if old.payment_state <> 'paid' and new.payment_state = 'paid'
       and new.freelancer_id is not null then
      perform app.queue(new.freelancer_id, 'paid', app.job_payload(new.id));
    end if;
  end if;

  return new;
end;
$$;

-- A change of crew is a change to publish, like a moved call time.
create or replace function app.note_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  what text;
begin
  if old.freelancer_id is distinct from new.freelancer_id then
    what := 'the crew';
  elsif old.is_lead is distinct from new.is_lead then
    what := 'the lead';
  elsif old.on_site is distinct from new.on_site
     or old.wrapped is distinct from new.wrapped
     or old.camera_ready is distinct from new.camera_ready then
    what := 'the call times';
  elsif old.due_on is distinct from new.due_on then
    what := 'the deadline';
  elsif old.briefing is distinct from new.briefing
     or old.shots is distinct from new.shots
     or old.equipment is distinct from new.equipment
     or old.expectations is distinct from new.expectations then
    what := 'the briefing';
  elsif old.delivery is distinct from new.delivery then
    what := 'the delivery terms';
  elsif old.fee_cents is distinct from new.fee_cents then
    what := 'a fee';
  else
    return new;
  end if;

  update public.assignments a
  set unpublished_changes = (
    select coalesce(array_agg(distinct x), '{}')
    from unnest(a.unpublished_changes || array[what]) as x
  )
  where a.id = new.assignment_id;

  return new;
end;
$$;

-- Publishing now does two things in order: tells the people who were already
-- on it what changed, then offers the job to anyone picked since. The new
-- people get the booking message, which carries everything, so they are not
-- also sent "the crew changed" about themselves.
create or replace function public.publish_assignment(job_id uuid)
returns integer
returns null on null input
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changes text[];
  r record;
  sent int := 0;
begin
  if not app.is_staff() then
    raise exception 'Only FEM can publish changes' using errcode = '42501';
  end if;

  select unpublished_changes into changes
  from public.assignments where id = job_id;

  if changes is not null and array_length(changes, 1) is not null then
    for r in
      select id, freelancer_id
      from public.assignment_roles
      where assignment_id = job_id and freelancer_id is not null and offered_at is not null
    loop
      perform app.queue(r.freelancer_id, 'job-changed',
        app.job_payload(r.id) || jsonb_build_object('changed', array_to_string(changes, ', ')));
      sent := sent + 1;
    end loop;
  end if;

  -- Offering is what makes the role appear on their dashboard and what sends
  -- the booking message, through the trigger on offered_at.
  for r in
    select id
    from public.assignment_roles
    where assignment_id = job_id and freelancer_id is not null and offered_at is null
  loop
    update public.assignment_roles set offered_at = now() where id = r.id;
    sent := sent + 1;
  end loop;

  update public.assignments
  set unpublished_changes = '{}',
      last_published_at = now()
  where id = job_id;

  insert into public.access_log (actor_id, action, subject_type, subject_id)
  values (
    auth.uid(),
    format('published: %s', coalesce(nullif(array_to_string(changes, ', '), ''), 'new crew')),
    'assignment',
    job_id
  );

  return sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delivered means delivered
-- ---------------------------------------------------------------------------

-- Stage 3 is the delivery step still in play: the shoot is done, the files are
-- not in. The invoice reminder treated that as "delivered, chase them", a step
-- too early.
create or replace function public.remind_invoice(role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if not app.is_staff() then
    raise exception 'Only FEM can send this' using errcode = '42501';
  end if;

  select id, freelancer_id, stage, payment_state, reminded_at
  into r
  from public.assignment_roles
  where id = role_id;

  if r is null or r.freelancer_id is null then
    raise exception 'No such role';
  end if;

  if r.stage < 4 then
    raise exception 'They have not delivered yet';
  end if;

  if r.payment_state <> 'not-invoiced' then
    raise exception 'Their invoice is already in';
  end if;

  if r.reminded_at is not null and r.reminded_at > now() - interval '20 hours' then
    raise exception 'Already reminded today';
  end if;

  perform app.queue(r.freelancer_id, 'invoice-due', app.job_payload(role_id));

  update public.assignment_roles
  set reminded_at = now()
  where id = role_id;

  insert into public.access_log (actor_id, action, subject_type, subject_id)
  values (auth.uid(), 'reminded about the invoice', 'assignment_role', role_id);
end;
$$;
