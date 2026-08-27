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

-- ---------------------------------------------------------------------------
-- A trigger that should have gone in 0009
-- ---------------------------------------------------------------------------

-- 0009 moved stage onto assignment_roles and tried to drop the old guard with
-- "drop trigger if exists guard_assignment_update". The trigger is called
-- assignments_guard_update -- the function is what is called
-- guard_assignment_update -- so the IF EXISTS quietly matched nothing and left
-- it attached to a table whose stage column had just been removed.
--
-- Staff never hit it: the guard returns early for them, which is why editing a
-- job kept working. Anything else touching this table fails on a column that no
-- longer exists, which is how this surfaced -- on the backfill below.
drop trigger if exists assignments_guard_update on public.assignments;
drop function if exists app.guard_assignment_update();

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
  -- Cast explicitly: kind is an enum, and Postgres will not quietly take a
  -- text literal for one.
  new.kind := case
    when new.on_site is not null and new.venue is not null then 'shoot'
    else 'project'
  end::public.job_kind;
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
end::public.job_kind;

comment on column public.assignments.kind is
  'Derived label, not a choice. A job may have a shoot day, a deadline, or both.';
