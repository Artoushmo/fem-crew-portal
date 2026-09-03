-- Four changes the screens asked for.

-- ---------------------------------------------------------------------------
-- How far someone travels
-- ---------------------------------------------------------------------------

-- A radius in kilometres reads precisely and matches nothing: a photographer in
-- Amsterdam who works "anywhere in the country" was being asked to pick a
-- number, and a producer was reading that number as though it meant something.
-- What actually decides a booking is whether they leave their region, the
-- country, or neither.
alter table public.profiles
  add column travel_scope text not null default 'nl'
    check (travel_scope in ('region', 'nl', 'international'));

-- Carry the numbers over rather than dropping them on the floor.
update public.profiles
set travel_scope = case
  when travel_radius_km is null then 'nl'
  when travel_radius_km <= 75 then 'region'
  else 'nl'
end;

comment on column public.profiles.travel_radius_km is
  'Superseded by travel_scope. Kept for the history it already holds.';

-- ---------------------------------------------------------------------------
-- Where the work is delivered
-- ---------------------------------------------------------------------------

-- Often FEM already has a gallery and the crew adds to it, rather than sending
-- a link back. Both happen, so both are recorded: the gallery on the job, the
-- link on the role for when they delivered somewhere else.
alter table public.assignments
  add column gallery_link text,
  add column gallery_note text;

comment on column public.assignments.gallery_link is
  'A Pixieset or similar gallery FEM has already made. When set, delivery means adding to it.';

-- ---------------------------------------------------------------------------
-- The invoice itself
-- ---------------------------------------------------------------------------

-- Step six said "invoice sent" and held nothing. FEM was told money was owed
-- and had to go looking in email for the document to pay against.
alter table public.assignment_roles
  add column invoice_path   text,
  add column invoice_name   text,
  add column invoice_sha256 text;

-- Freelancers write their own invoice into the same private bucket, under their
-- own role, and cannot replace or remove it afterwards -- it is what a payment
-- was made against.
create policy "freelancer uploads own invoice"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agreements'
    and app.mfa_satisfied()
    and (storage.foldername(name))[1] = 'invoices'
    and exists (
      select 1 from public.assignment_roles r
      where r.freelancer_id = auth.uid()
        and r.offered_at is not null
        and (storage.foldername(name))[2] = r.id::text
    )
  );

drop policy if exists "read agreements you are party to" on storage.objects;

create policy "read agreements you are party to"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'agreements'
    and (
      app.is_staff()
      or (storage.foldername(name))[1] ~ '^[0-9]{4}$'
      or exists (
        select 1
        from public.assignment_roles r
        where r.freelancer_id = auth.uid()
          and r.offered_at is not null
          and (
            ((storage.foldername(name))[1] = 'jobs'
              and (storage.foldername(name))[2] = r.assignment_id::text)
            or ((storage.foldername(name))[1] in ('signed', 'invoices')
              and (storage.foldername(name))[2] = r.id::text)
          )
      )
      or (
        (storage.foldername(name))[1] = 'signed-agreement'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Going back a step
-- ---------------------------------------------------------------------------

-- People click too fast, and payments fail after they were marked good. The
-- workflow only ever went forwards, so the fix was to ask FEM to edit the
-- database.
--
-- A step can now go back by one, and every move is written down. That is what
-- makes reversing safe to allow: the tracker shows where things stand, and the
-- ledger shows how they got there -- including the step someone took twice.
create table public.role_events (
  id          uuid primary key default gen_random_uuid(),
  role_id     uuid not null references public.assignment_roles(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text,
  from_stage  smallint not null,
  to_stage    smallint not null,
  direction   text not null check (direction in ('forward', 'back')),
  note        text,
  created_at  timestamptz not null default now()
);

create index role_events_role_idx on public.role_events (role_id, created_at desc);

alter table public.role_events enable row level security;

grant select on public.role_events to authenticated;

create policy "read events for your own role"
  on public.role_events for select
  to authenticated
  using (
    app.is_staff()
    or exists (
      select 1 from public.assignment_roles r
      where r.id = role_events.role_id and r.freelancer_id = auth.uid()
    )
  );

-- Written by the trigger only. Nothing may edit or delete: a record of what
-- happened that can be tidied afterwards records nothing.
create or replace function app.log_stage_move()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who text;
begin
  if new.stage = old.stage then return new; end if;

  select full_name into who from public.profiles where id = auth.uid();

  insert into public.role_events (role_id, actor_id, actor_name, from_stage, to_stage, direction)
  values (
    new.id, auth.uid(), who, old.stage, new.stage,
    case when new.stage > old.stage then 'forward' else 'back' end
  );

  return new;
end;
$$;

create trigger log_stage_move
  after update of stage on public.assignment_roles
  for each row execute function app.log_stage_move();

-- The guard allows one step either way now, and still pins everything FEM owns.
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

  new.assignment_id := old.assignment_id;
  new.freelancer_id := old.freelancer_id;
  new.craft         := old.craft;
  new.role_label    := old.role_label;
  new.fee_cents     := old.fee_cents;
  new.offered_at    := old.offered_at;
  new.paid_on       := old.paid_on;

  -- A signature stands even when the step is walked back. Stepping back is
  -- undoing progress, not unsigning a contract.
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
-- Undoing a payment
-- ---------------------------------------------------------------------------

-- Payments bounce, and get sent twice, and go to the wrong account. Confirming
-- one had no way back except editing the table by hand.
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
      stage         = 5,
      stage_dates   = stage_dates - '6'
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

revoke all on function public.unconfirm_payment(uuid, text) from public, anon;
grant execute on function public.unconfirm_payment(uuid, text) to authenticated;
