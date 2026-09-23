-- Waiting is not the same as doing nothing.
--
-- A job sits in "to be invoiced" until the freelancer sends one, and there is
-- nothing FEM can click -- so the page reads as a dead end and the chasing
-- happens in WhatsApp, where nobody can see whether it was done.
--
-- So there is one thing to click: a reminder. And it is recorded, because the
-- question a week later is not "did they invoice" but "did we ask".

alter table public.assignment_roles
  add column reminded_at timestamptz;

comment on column public.assignment_roles.reminded_at is
  'When we last asked them for the invoice. Null means never.';

-- Theirs to move, not theirs to clear: a freelancer must not be able to make a
-- reminder look unsent.
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
-- Asking for the invoice
-- ---------------------------------------------------------------------------

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

  -- Only worth sending while it is actually the thing we are waiting for.
  if r.stage < 3 then
    raise exception 'They have not delivered yet';
  end if;

  if r.payment_state <> 'not-invoiced' then
    raise exception 'Their invoice is already in';
  end if;

  -- One a day at most. A reminder that arrives twice in an afternoon reads as
  -- an accusation, and the second one is never the one that works.
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

revoke all on function public.remind_invoice(uuid) from public, anon;
grant execute on function public.remind_invoice(uuid) to authenticated;
