-- Something to call a job out loud.
--
-- Every list needs a handle that survives a rename and fits in a subject line.
-- A uuid does not: nobody reads one over the phone, and "the RAI one" stops
-- working the second there are two.
--
-- FEM-2026-0001, counted per year, assigned once and never reused.

alter table public.assignments add column reference text;

create unique index assignments_reference_idx on public.assignments (reference);

create or replace function app.set_job_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  yr   int := extract(year from coalesce(new.starts_at, now()))::int;
  next int;
begin
  if new.reference is not null then return new; end if;

  -- One writer per year at a time. Two jobs created in the same second would
  -- otherwise read the same maximum and claim the same number.
  perform pg_advisory_xact_lock(hashtext('fem_job_reference'), yr);

  select coalesce(max(substring(reference from 10)::int), 0) + 1
  into next
  from public.assignments
  where reference like 'FEM-' || yr || '-%';

  new.reference := format('FEM-%s-%s', yr, lpad(next::text, 4, '0'));
  return new;
end;
$$;

create trigger set_job_reference
  before insert on public.assignments
  for each row execute function app.set_job_reference();

-- Number what is already there, oldest first, so the sequence reads like the
-- order the work actually came in.
do $$
declare
  r record;
  counters jsonb := '{}'::jsonb;
  yr text;
  n int;
begin
  for r in
    select id, extract(year from starts_at)::int as yr
    from public.assignments
    where reference is null
    order by created_at
  loop
    yr := r.yr::text;
    n := coalesce((counters ->> yr)::int, 0) + 1;
    counters := counters || jsonb_build_object(yr, n);

    update public.assignments
    set reference = format('FEM-%s-%s', yr, lpad(n::text, 4, '0'))
    where id = r.id;
  end loop;
end $$;
