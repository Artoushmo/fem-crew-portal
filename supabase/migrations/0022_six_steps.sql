-- Six steps, not seven.
--
-- Step one asked a freelancer to sign paperwork for the job. The yearly
-- Freelancer Agreement already covers the working relationship, so that was a
-- second signature for the same terms -- and a step that could be walked back,
-- which is not what a signature is.
--
-- Signing is now a condition, not a step. Nobody can be booked onto a job until
-- this year's agreement is signed, and nobody can accept one either. That is a
-- stronger rule than a step in a tracker: a step can be skipped past by an
-- impatient click, a condition cannot.
--
-- So the workflow starts where the work starts: accepting.
--
--   old  0 contract  1 accepted  2 briefing  3 shoot  4 upload  5 invoice  6 paid
--   new              0 accepted  1 briefing  2 shoot  3 upload  4 invoice  5 paid

-- ---------------------------------------------------------------------------
-- The job's own contract goes
-- ---------------------------------------------------------------------------

-- The trigger that reset people's progress when a job contract changed has
-- nothing left to watch, and leaving it armed over columns nobody maintains is
-- how a stage gets reset months from now for no visible reason.
drop trigger if exists reopen_on_contract_change on public.assignments;
drop function if exists app.reopen_on_contract_change();

-- Columns stay. Anything already signed against a job contract keeps its
-- record; the workflow simply no longer asks for one.
comment on column public.assignments.contract_path is
  'Retired. The yearly Freelancer Agreement covers the terms; kept for jobs that already carried one.';

-- ---------------------------------------------------------------------------
-- Shift everyone down a step
-- ---------------------------------------------------------------------------

alter table public.assignment_roles drop constraint if exists assignment_roles_stage_check;

update public.assignment_roles
set
  stage = greatest(stage - 1, 0),
  -- Keys move with the stages they belong to. Step one's date is dropped: it
  -- recorded a signature that is no longer part of this workflow, and the
  -- signature itself is still in the ledger.
  stage_dates = coalesce(
    (
      select jsonb_object_agg((key::int - 1)::text, value)
      from jsonb_each(stage_dates)
      where key::int > 0
    ),
    '{}'::jsonb
  );

alter table public.assignment_roles
  add constraint assignment_roles_stage_check check (stage between 0 and 5);

-- ---------------------------------------------------------------------------
-- No booking, and no accepting, without a signed agreement
-- ---------------------------------------------------------------------------

create or replace function app.has_signed_agreement(who uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.agreements a
    where a.freelancer_id = who
      and a.year = extract(year from current_date)::smallint
      and a.signed_on is not null
  );
$$;

create or replace function app.require_agreement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Booking someone who has not signed.
  if new.freelancer_id is not null
     and (tg_op = 'INSERT' or old.freelancer_id is distinct from new.freelancer_id)
     and not app.has_signed_agreement(new.freelancer_id) then
    raise exception 'They have not signed this year''s Freelancer Agreement yet'
      using errcode = '42501';
  end if;

  -- Accepting without one. Checked as well as the booking, because an agreement
  -- can be replaced between the offer and the answer.
  if tg_op = 'UPDATE'
     and new.stage > old.stage
     and new.freelancer_id is not null
     and not app.has_signed_agreement(new.freelancer_id) then
    raise exception 'Sign this year''s Freelancer Agreement before taking this on'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger require_agreement
  before insert or update on public.assignment_roles
  for each row execute function app.require_agreement();

-- ---------------------------------------------------------------------------
-- Accepting is final
-- ---------------------------------------------------------------------------

-- Everything else can be walked back; this cannot. Accepting is the moment FEM
-- stops looking for someone else, and an undo that quietly reopens the search
-- is worse than no undo.
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

  if old.contract_signed_on is not null then
    new.contract_signed_on := old.contract_signed_on;
  end if;

  if new.payment_state = 'paid' and old.payment_state <> 'paid' then
    raise exception 'only FEM can confirm payment';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The stage numbers everything else reads
-- ---------------------------------------------------------------------------

create or replace function public.confirm_payment(role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_state public.payment_state;
begin
  if not app.is_staff() then
    raise exception 'Only FEM can confirm a payment' using errcode = '42501';
  end if;

  select payment_state into current_state
  from public.assignment_roles where id = role_id;

  if current_state is null then
    raise exception 'No such role' using errcode = 'P0002';
  end if;

  if current_state = 'paid' then return; end if;

  if current_state <> 'awaiting' then
    raise exception 'There is no invoice to pay yet' using errcode = '23514';
  end if;

  update public.assignment_roles
  set payment_state = 'paid',
      paid_on       = current_date,
      stage         = greatest(stage, 5),
      stage_dates   = coalesce(stage_dates, '{}'::jsonb)
                        || jsonb_build_object('5', to_char(current_date, 'YYYY-MM-DD'))
  where id = role_id;

  insert into public.access_log (actor_id, action, subject_type, subject_id)
  values (auth.uid(), 'payment confirmed', 'assignment_role', role_id);
end;
$$;

create or replace function public.unconfirm_payment(role_id uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_staff() then
    raise exception 'Only FEM can undo a payment' using errcode = '42501';
  end if;

  update public.assignment_roles
  set payment_state = 'awaiting',
      paid_on       = null,
      stage         = 4,
      stage_dates   = stage_dates - '5'
  where id = role_id and payment_state = 'paid';

  if not found then
    raise exception 'That role is not marked paid' using errcode = '23514';
  end if;

  insert into public.access_log (actor_id, action, subject_type, subject_id)
  values (
    auth.uid(),
    coalesce('payment undone: ' || reason, 'payment undone'),
    'assignment_role',
    role_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Messages follow the new numbering, and stop repeating
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

  if new.freelancer_id is not null
     and (tg_op = 'INSERT' or old.freelancer_id is distinct from new.freelancer_id)
     and new.offered_at is not null then
    perform app.queue(new.freelancer_id, 'booked', app.job_payload(new.id));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.freelancer_id is not null and new.freelancer_id is null then
      perform app.queue(old.freelancer_id, 'unbooked', app.job_payload(new.id));
      return new;
    end if;

    -- Accepted. Keyed off accepted_at rather than the stage, so walking a step
    -- back and forward again does not send a second "they accepted" to a
    -- producer who already knows.
    if old.accepted_at is null and new.accepted_at is not null and producer is not null then
      perform app.queue(producer, 'accepted', app.job_payload(new.id));
    end if;

    -- Delivered: step four under the new numbering.
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
