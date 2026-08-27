-- A signature belongs to one version of a document.
--
-- FEM detached a contract and attached a different one. The freelancer's
-- signature -- given against the old file -- kept counting, and their screen
-- offered Continue as though nothing had happened. That is the failure the hash
-- was added to catch, and nothing was comparing it.
--
-- So the fingerprint someone signed is stored beside their signature, and the
-- signature only holds while it still matches the document on the job. Change
-- the paperwork and the signature drops: whoever had not started yet goes back
-- to step one, and whoever is already past the briefing keeps their progress
-- but still has to sign the new version. Either way the reason is on screen,
-- rather than a workflow that silently moved on without them.

alter table public.assignment_roles
  add column contract_signed_sha256 text,
  add column reopened_at timestamptz,
  add column reopened_reason text;

alter table public.agreements
  add column signed_sha256 text;

comment on column public.assignment_roles.contract_signed_sha256 is
  'Fingerprint of the contract as signed. Differs from the job''s current contract when FEM replaced it, which reopens the step.';

-- ---------------------------------------------------------------------------
-- Reopening
-- ---------------------------------------------------------------------------

create or replace function app.reopen_on_contract_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only when the paperwork actually changed. Editing a briefing does not
  -- invalidate anybody's signature.
  if coalesce(old.contract_sha256, '') is not distinct from coalesce(new.contract_sha256, '')
     and coalesce(old.contract_path, '') is not distinct from coalesce(new.contract_path, '') then
    return new;
  end if;

  update public.assignment_roles r
  set
    contract_signed_on     = null,
    contract_signed_at     = null,
    contract_signed_sha256 = null,
    -- Back to step one only for someone who has not started yet. Past the
    -- briefing the work has begun, and new paperwork does not undo a shoot
    -- that happened -- they still have to sign, but their progress stands.
    stage                  = case when r.stage <= 2 then 0 else r.stage end,
    reopened_at            = now(),
    reopened_reason        = case
                               when new.contract_path is null
                                 then 'FEM removed the contract for this job. Your Freelancer Agreement now covers it.'
                               when r.stage > 2
                                 then 'FEM replaced the contract for this job. Please read and sign the new version -- your progress is kept.'
                               else 'FEM replaced the contract for this job. Please read and sign the new version.'
                             end
  where r.assignment_id = new.id
    and r.freelancer_id is not null
    and (r.contract_signed_on is not null or r.stage > 0);

  return new;
end;
$$;

create trigger reopen_on_contract_change
  after update of contract_path, contract_sha256 on public.assignments
  for each row execute function app.reopen_on_contract_change();

-- ---------------------------------------------------------------------------
-- The same rule for the yearly agreement
-- ---------------------------------------------------------------------------

-- Replacing the year's agreement means everyone signed something that is no
-- longer the agreement. Their signature stays in the ledger as a record of what
-- they signed; it just stops counting as having signed this one.
create or replace function app.reopen_on_agreement_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.sha256, '') is not distinct from coalesce(new.sha256, '') then
    return new;
  end if;

  delete from public.agreements a
  where a.year = new.year
    and (a.signed_sha256 is null or a.signed_sha256 <> new.sha256);

  return new;
end;
$$;

create trigger reopen_on_agreement_change
  after update of sha256 on public.agreement_documents
  for each row execute function app.reopen_on_agreement_change();

-- ---------------------------------------------------------------------------
-- The guard has to allow the reset
-- ---------------------------------------------------------------------------

-- The trigger above runs as the definer, so it is not subject to the freelancer
-- guard. But a freelancer whose step was reopened must be able to walk forward
-- again from zero, which the existing one-step rule already permits.
-- Nothing to change here; noted so the next reader does not go looking.
