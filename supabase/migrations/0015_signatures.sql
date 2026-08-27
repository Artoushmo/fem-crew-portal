-- Evidence, not decoration.
--
-- A click that records "signed" is already a simple electronic signature under
-- eIDAS, and valid for freelance work. What it is not is provable: if someone
-- says a year later that they never signed, or that the document said something
-- else, there is nothing to hold up.
--
-- So this is a ledger of signing events, and the fields that matter are the
-- ones the browser is not allowed to fill in. Who signed, when, and from where
-- come from the request itself; the document is pinned by its hash, so a file
-- swapped afterwards no longer matches what was signed against.
--
-- Rows can be inserted and read. Nothing can update or delete them, staff
-- included -- an audit trail somebody can edit is not an audit trail.

-- ---------------------------------------------------------------------------
-- Fingerprint what is being signed
-- ---------------------------------------------------------------------------

alter table public.agreement_documents
  add column sha256 text,
  add column size_bytes integer;

alter table public.assignments
  add column contract_sha256 text;

comment on column public.agreement_documents.sha256 is
  'SHA-256 of the uploaded PDF, computed in the browser. Proves the file signed against is the file still stored.';

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------

create table public.signatures (
  id              uuid primary key default gen_random_uuid(),

  -- Quoted on the receipt, so a person has something to refer to.
  reference       text not null unique,

  -- Filled by the trigger below from the verified session, never from the
  -- request body. A signature you can address to someone else is worthless.
  signer_id       uuid not null references public.profiles(id) on delete restrict,
  signer_name     text,
  signer_email    text,

  -- What was signed.
  document_kind   text not null check (document_kind in ('agreement', 'job-contract')),
  document_name   text not null,
  document_sha256 text,
  document_path   text,

  -- Which record this signature belongs to.
  subject_type    text not null check (subject_type in ('agreement', 'assignment_role')),
  subject_id      uuid not null,

  -- Circumstances. signed_at is the server's clock, not the laptop's.
  signed_at       timestamptz not null default now(),
  ip              text,
  user_agent      text,

  created_at      timestamptz not null default now()
);

create index signatures_signer_idx  on public.signatures (signer_id);
create index signatures_subject_idx on public.signatures (subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- What the client may not decide
-- ---------------------------------------------------------------------------

create or replace function app.stamp_signature()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  headers json;
  forwarded text;
begin
  -- Identity comes from the verified session. Anything the browser sent for
  -- these fields is discarded rather than trusted.
  new.signer_id := auth.uid();

  select p.full_name, p.email into new.signer_name, new.signer_email
  from public.profiles p where p.id = auth.uid();

  new.signed_at := now();

  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    headers := null;
  end;

  if headers is not null then
    -- The first hop in x-forwarded-for is the client; the rest are proxies.
    forwarded := headers ->> 'x-forwarded-for';
    new.ip := nullif(split_part(coalesce(forwarded, ''), ',', 1), '');
    new.user_agent := left(coalesce(headers ->> 'user-agent', ''), 400);
  end if;

  new.created_at := now();
  return new;
end;
$$;

create trigger stamp_signature
  before insert on public.signatures
  for each row execute function app.stamp_signature();

-- ---------------------------------------------------------------------------
-- Who may read it
-- ---------------------------------------------------------------------------

alter table public.signatures enable row level security;

-- Deliberately no update or delete grant, for anybody.
grant select, insert on public.signatures to authenticated;

create policy "sign as yourself"
  on public.signatures for insert
  to authenticated
  with check (app.mfa_satisfied());

create policy "read your own signatures"
  on public.signatures for select
  to authenticated
  using (signer_id = auth.uid() and app.mfa_satisfied());

create policy "staff read all signatures"
  on public.signatures for select
  to authenticated
  using (app.is_staff());

-- ---------------------------------------------------------------------------
-- The moment, not just the day
-- ---------------------------------------------------------------------------

-- signed_on is a date, which is enough to show and not enough to prove.
alter table public.agreements add column signed_at timestamptz;
alter table public.assignment_roles add column contract_signed_at timestamptz;
