-- One contract, not one per job.
--
-- A freelancer signs FEM's Freelancer Agreement once a year and that covers the
-- working relationship. The per-assignment contract was a second set of terms
-- for the same thing: another signature to chase, another document to keep in
-- step, and a second answer to "what did they agree to".
--
-- 0022 already removed it from the workflow. This removes it from the schema,
-- rather than leaving columns nobody writes and a trigger nobody expects.
--
-- The condition stays and is the whole of it: no booking and no accepting
-- without this year's agreement signed.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.assignments
  drop column if exists contract_path,
  drop column if exists contract_name,
  drop column if exists contract_sha256;

alter table public.assignment_roles
  drop column if exists contract_signed_on,
  drop column if exists contract_signed_at,
  drop column if exists contract_signed_sha256,
  drop column if exists signed_copy_path,
  drop column if exists signed_copy_name,
  drop column if exists signed_copy_sha256,
  -- Only the contract-change trigger ever set these, and that went in 0022.
  drop column if exists reopened_at,
  drop column if exists reopened_reason;

-- Signatures already given stay in the ledger. It records what happened, and
-- what happened does not change because the feature did.

-- ---------------------------------------------------------------------------
-- The guard stops pinning a column that is gone
-- ---------------------------------------------------------------------------

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

  if new.payment_state = 'paid' and old.payment_state <> 'paid' then
    raise exception 'only FEM can confirm payment';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Unbooking has less to clear
-- ---------------------------------------------------------------------------

-- Nothing to do in SQL: the client clears what it sets, and the columns it used
-- to clear no longer exist.

-- ---------------------------------------------------------------------------
-- The bucket keeps two kinds of file, not four
-- ---------------------------------------------------------------------------

drop policy if exists "read agreements you are party to" on storage.objects;
drop policy if exists "freelancer returns a signed copy" on storage.objects;

-- 2026/...            the yearly agreement FEM publishes
-- invoices/<role>/... an invoice a freelancer sent for that role
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
          and (storage.foldername(name))[1] = 'invoices'
          and (storage.foldername(name))[2] = r.id::text
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Messages about a contract that no longer exists
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
