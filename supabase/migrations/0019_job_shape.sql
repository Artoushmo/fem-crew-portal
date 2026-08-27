-- A job is not one thing or the other.
--
-- 0010 made every job either a shoot or a project, and that was already too
-- narrow: a launch can be a shoot day plus a website, and picking one meant
-- inventing the other half or leaving it out. The either/or was never a fact
-- about the work, only about the form.
--
-- So the two things a job can have are independent. It has a shoot day, or a
-- deadline, or both -- and at least one, because a job with neither cannot be
-- scheduled, chased or sorted.
--
-- kind stays as a stored label so existing filters keep working, but it is
-- derived from what is actually filled in rather than chosen up front. Nothing
-- reads it to decide what a job is any more.

alter table public.assignments
  drop constraint if exists assignments_kind_shape;

alter table public.assignments
  add constraint assignments_has_a_date check (
    -- A shoot day: on site and wrapped make it a real day, a venue makes it a
    -- place. Half a shoot day is not a shoot day.
    (on_site is not null and wrapped is not null and venue is not null)
    or due_on is not null
  );

-- Keep the label honest without asking anyone to maintain it.
create or replace function app.set_job_kind()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.kind := case
    when new.on_site is not null and new.venue is not null then 'shoot'
    else 'project'
  end;
  return new;
end;
$$;

drop trigger if exists set_job_kind on public.assignments;

create trigger set_job_kind
  before insert or update on public.assignments
  for each row execute function app.set_job_kind();

-- Bring the existing rows in line with what they actually hold.
update public.assignments
set kind = case
  when on_site is not null and venue is not null then 'shoot'
  else 'project'
end;

comment on column public.assignments.kind is
  'Derived label, not a choice. A job may have a shoot day, a deadline, or both.';
