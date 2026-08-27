-- Signing on paper, and a read policy that was too wide.
--
-- Clicking Sign is one way to agree. The other is the one most contracts still
-- take: download it, sign it by hand or in your own tool, send it back. The
-- portal offered no way to do that, so anyone whose client insists on a returned
-- PDF was stuck outside the workflow.
--
-- And 0013 let any signed-in account read the whole agreements bucket. That was
-- right for the yearly agreement, which everyone is asked to sign, and wrong for
-- everything else: it also handed every freelancer the client contracts of jobs
-- they were never on, and later would have handed them each other's signed
-- copies. Tightened here, by path.

-- ---------------------------------------------------------------------------
-- Where a returned copy lives
-- ---------------------------------------------------------------------------

alter table public.assignment_roles
  add column signed_copy_path   text,
  add column signed_copy_name   text,
  add column signed_copy_sha256 text;

alter table public.agreements
  add column signed_copy_path   text,
  add column signed_copy_name   text,
  add column signed_copy_sha256 text;

comment on column public.assignment_roles.signed_copy_path is
  'A countersigned PDF returned by the freelancer. Optional: clicking Sign is a signature in its own right.';

-- Paths in the agreements bucket, and what each means:
--   2026/...              the yearly agreement FEM publishes
--   jobs/<assignment>/... a client contract for one job
--   signed/<role>/...     a copy returned by the freelancer on that role
--   signed-agreement/<user>/... a returned copy of the yearly agreement

-- ---------------------------------------------------------------------------
-- Reading, by path rather than by "is signed in"
-- ---------------------------------------------------------------------------

drop policy if exists "signed in read agreements" on storage.objects;

create policy "read agreements you are party to"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'agreements'
    and (
      app.is_staff()

      -- The yearly agreement. Everyone asked to sign it has to be able to read
      -- it; withholding the terms and asking for a signature is not security.
      or (storage.foldername(name))[1] ~ '^[0-9]{4}$'

      -- A contract for a job you are booked on, or your own returned copy.
      or exists (
        select 1
        from public.assignment_roles r
        where r.freelancer_id = auth.uid()
          and r.offered_at is not null
          and (
            ((storage.foldername(name))[1] = 'jobs'
              and (storage.foldername(name))[2] = r.assignment_id::text)
            or ((storage.foldername(name))[1] = 'signed'
              and (storage.foldername(name))[2] = r.id::text)
          )
      )

      -- Your own returned copy of the yearly agreement.
      or (
        (storage.foldername(name))[1] = 'signed-agreement'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Returning a signed copy
-- ---------------------------------------------------------------------------

-- A freelancer may write only under their own role, or their own name for the
-- yearly agreement. Everything else in this bucket stays FEM's.
create policy "freelancer returns a signed copy"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agreements'
    and app.mfa_satisfied()
    and (
      exists (
        select 1 from public.assignment_roles r
        where r.freelancer_id = auth.uid()
          and r.offered_at is not null
          and (storage.foldername(name))[1] = 'signed'
          and (storage.foldername(name))[2] = r.id::text
      )
      or (
        (storage.foldername(name))[1] = 'signed-agreement'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

-- Deliberately no update or delete for freelancers. A returned contract is
-- evidence; replacing it quietly is exactly what it must not allow. Uploading
-- again writes a new file, and the newest is the one on the record.

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------

-- Same shape as before, with the returned copy added to what a freelancer sets
-- for themselves and FEM cannot silently overwrite.
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
