-- A contract for this job, when the client brings one.
--
-- The yearly Freelancer Agreement covers the working relationship. Some jobs
-- come with their own paperwork on top -- an NDA, a client's own terms, a buyout
-- -- and some do not. Step one of the workflow has to mean the same thing in
-- both cases: the paperwork for this job is settled.
--
-- So the contract hangs off the assignment, optional, and step one reads it when
-- it is there and falls back to the yearly agreement when it is not. No step is
-- skipped, because a skipped step in a seven-step tracker is a step nobody can
-- explain later.

alter table public.assignments
  add column contract_path text,
  add column contract_name text;

comment on column public.assignments.contract_path is
  'Optional job-specific contract in the agreements bucket. Null means the yearly Freelancer Agreement covers it.';

-- Signed per person, not per job: three freelancers on one shoot each sign for
-- themselves.
alter table public.assignment_roles
  add column contract_signed_on date;

-- The guard pins what FEM owns. A freelancer records their own signature and
-- nothing else about it.
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

  new.assignment_id := old.assignment_id;
  new.freelancer_id := old.freelancer_id;
  new.craft         := old.craft;
  new.role_label    := old.role_label;
  new.fee_cents     := old.fee_cents;
  new.offered_at    := old.offered_at;
  new.paid_on       := old.paid_on;

  -- Once signed, it stays signed. Unsigning from the same screen that signed it
  -- would make the record worthless.
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

-- The job contract lives in the same private bucket as the yearly agreement,
-- under its own prefix. Policies from 0013 already cover it: FEM writes,
-- signed-in users read, and every read goes through an expiring signed url.
