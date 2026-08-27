-- Telling people what changed.
--
-- Nobody watches a portal all day. A booking is a question -- can you be in the
-- RAI on the 23rd -- and it was sitting in a screen waiting for someone to walk
-- past it.
--
-- The important thing here is where the message is written. Sending from the
-- browser after the click means a closed tab produces a booking with no notice,
-- and you find out when nobody turns up. So the trigger writes the message in
-- the same transaction as the change: if the change committed, the message
-- exists. Delivery is a separate, retryable step -- it can fail, and be tried
-- again, without the record of what happened ever being in doubt.

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),

  recipient_id  uuid references public.profiles(id) on delete cascade,
  recipient_email text not null,

  kind          text not null,
  -- Everything the email needs, captured at the moment it happened. A mail
  -- about a shoot that was since moved should say what it said then, not what
  -- the row looks like when the queue is finally drained.
  payload       jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  attempts      smallint not null default 0,
  last_error    text
);

create index notifications_pending_idx on public.notifications (created_at)
  where sent_at is null;

alter table public.notifications enable row level security;

grant select on public.notifications to authenticated;

-- Readable by the person it is about, so "did FEM tell me?" has an answer.
-- Writing is the triggers' job and draining is the function's; neither goes
-- through this grant.
create policy "read your own notifications"
  on public.notifications for select
  to authenticated
  using (recipient_id = auth.uid() and app.mfa_satisfied());

create policy "staff read notifications"
  on public.notifications for select
  to authenticated
  using (app.is_staff());

-- ---------------------------------------------------------------------------
-- What a message knows
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
    'starts_at',   a.starts_at,
    'due_on',      a.due_on,
    'on_site',     a.on_site,
    'wrapped',     a.wrapped,
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

create or replace function app.queue(
  to_id uuid,
  kind text,
  payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  addr text;
begin
  select email into addr from public.profiles where id = to_id and status = 'active';

  -- No address, no message. Revoked accounts are skipped on purpose: they are
  -- not crew any more.
  if addr is null then return; end if;

  insert into public.notifications (recipient_id, recipient_email, kind, payload)
  values (to_id, addr, kind, payload);
end;
$$;

-- ---------------------------------------------------------------------------
-- The moments worth a message
-- ---------------------------------------------------------------------------

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

  -- Booked. The one message somebody has to act on.
  if new.freelancer_id is not null
     and (tg_op = 'INSERT' or old.freelancer_id is distinct from new.freelancer_id)
     and new.offered_at is not null then
    perform app.queue(new.freelancer_id, 'booked', app.job_payload(new.id));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Unbooked. They may have kept the day free.
    if old.freelancer_id is not null and new.freelancer_id is null then
      perform app.queue(old.freelancer_id, 'unbooked', app.job_payload(new.id));
      return new;
    end if;

    -- The paperwork changed under them.
    if new.reopened_reason is not null
       and old.reopened_reason is distinct from new.reopened_reason then
      perform app.queue(new.freelancer_id, 'contract-changed',
        app.job_payload(new.id) || jsonb_build_object('reason', new.reopened_reason));
    end if;

    -- Signed. FEM asked for paperwork; FEM should hear when it comes back,
    -- especially when it came back as a returned PDF that needs filing.
    if old.contract_signed_on is null and new.contract_signed_on is not null
       and producer is not null then
      perform app.queue(producer, 'contract-signed',
        app.job_payload(new.id) || jsonb_build_object(
          'returned_copy', new.signed_copy_name is not null));
    end if;

    -- Accepted: FEM can stop looking for someone else.
    if old.stage < 2 and new.stage >= 2 and producer is not null then
      perform app.queue(producer, 'accepted', app.job_payload(new.id));
    end if;

    -- Delivered, and invoiced: both land on the producer's desk.
    if old.stage < 5 and new.stage >= 5 and producer is not null then
      perform app.queue(producer, 'delivered',
        app.job_payload(new.id) || jsonb_build_object('link', new.delivery_link));
    end if;

    if old.payment_state <> 'awaiting' and new.payment_state = 'awaiting'
       and producer is not null then
      perform app.queue(producer, 'invoiced',
        app.job_payload(new.id) || jsonb_build_object('invoice', new.invoice_number));
    end if;

    -- Paid.
    if old.payment_state <> 'paid' and new.payment_state = 'paid'
       and new.freelancer_id is not null then
      perform app.queue(new.freelancer_id, 'paid', app.job_payload(new.id));
    end if;
  end if;

  return new;
end;
$$;

create trigger notify_role_change
  after insert or update on public.assignment_roles
  for each row execute function app.notify_role_change();

-- ---------------------------------------------------------------------------
-- When the job itself moves
-- ---------------------------------------------------------------------------

-- A changed call time is the one edit that ruins someone's day if they miss it.
create or replace function app.notify_job_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  what text[] := '{}';
begin
  if old.starts_at is distinct from new.starts_at then
    what := array_append(what, 'the date');
  end if;
  if old.on_site is distinct from new.on_site or old.wrapped is distinct from new.wrapped then
    what := array_append(what, 'the call times');
  end if;
  if old.venue is distinct from new.venue or old.city is distinct from new.city then
    what := array_append(what, 'the location');
  end if;
  if old.due_on is distinct from new.due_on then
    what := array_append(what, 'the deadline');
  end if;

  if array_length(what, 1) is null then return new; end if;

  for r in
    select id, freelancer_id from public.assignment_roles
    where assignment_id = new.id and freelancer_id is not null and offered_at is not null
  loop
    perform app.queue(r.freelancer_id, 'job-changed',
      app.job_payload(r.id) || jsonb_build_object('changed', array_to_string(what, ', ')));
  end loop;

  return new;
end;
$$;

create trigger notify_job_change
  after update on public.assignments
  for each row execute function app.notify_job_change();
