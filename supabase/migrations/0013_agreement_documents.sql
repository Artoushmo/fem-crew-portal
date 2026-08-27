-- The agreement itself.
--
-- The portal asked freelancers to sign a Freelancer Agreement that existed only
-- as a heading. Nobody could read what they were agreeing to, which makes the
-- signature worth nothing -- and FEM had nowhere to put the document the client
-- actually offers.
--
-- One document per year, uploaded by FEM, read by everyone who is asked to sign
-- it. Per-freelancer signatures already live in public.agreements; this is the
-- paper they are signing against.

create table public.agreement_documents (
  year          smallint primary key,
  storage_path  text not null,
  original_name text not null,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);

alter table public.agreement_documents enable row level security;

grant select on public.agreement_documents to authenticated;
grant insert, update, delete on public.agreement_documents to authenticated;

-- Anyone signed in may see which document they are being asked to sign. Being
-- shown the terms is the point; hiding them and asking for a signature is not a
-- security measure, it is a worse agreement.
create policy "everyone reads the agreement"
  on public.agreement_documents for select
  to authenticated
  using (true);

create policy "staff manage the agreement"
  on public.agreement_documents for all
  to authenticated
  using (app.is_staff())
  with check (app.is_staff());

-- ---------------------------------------------------------------------------
-- Where the file lives
-- ---------------------------------------------------------------------------

-- Private. The file is read through a signed url with a short life, so a link
-- copied out of the portal stops working rather than becoming a public
-- contract.
insert into storage.buckets (id, name, public)
values ('agreements', 'agreements', false)
on conflict (id) do nothing;

drop policy if exists "staff upload agreements" on storage.objects;
drop policy if exists "signed in read agreements" on storage.objects;

create policy "staff upload agreements"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'agreements' and app.is_staff());

create policy "staff replace agreements"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'agreements' and app.is_staff())
  with check (bucket_id = 'agreements' and app.is_staff());

create policy "staff remove agreements"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'agreements' and app.is_staff());

create policy "signed in read agreements"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'agreements');

-- ---------------------------------------------------------------------------
-- Signing needs something to sign
-- ---------------------------------------------------------------------------

-- A signature against no document is a checkbox. The insert policy from 0012
-- stays as it is; this adds the one condition that gives it meaning.
drop policy if exists "freelancer signs own agreement" on public.agreements;

create policy "freelancer signs own agreement"
  on public.agreements for insert
  to authenticated
  with check (
    freelancer_id = auth.uid()
    and app.mfa_satisfied()
    and exists (select 1 from public.agreement_documents d where d.year = agreements.year)
  );
