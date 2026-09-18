-- Saving is not telling.
--
-- Every edit to a job sent mail the moment it was written. So a producer fixing
-- a venue, then the times, then a typo in the briefing sent three messages in
-- four minutes -- and the crew learned to ignore all of them.
--
-- Worse the other way round: an edit made and then thought better of had
-- already gone out.
--
-- So an edit is saved, and what changed is remembered. Publishing is a separate
-- act that sends one message naming everything since the last one.

alter table public.assignments
  add column unpublished_changes text[] not null default '{}',
  add column last_published_at   timestamptz;

comment on column public.assignments.unpublished_changes is
  'What changed since the last publish, in the crew''s words. Emptied by publish_assignment.';

-- ---------------------------------------------------------------------------
-- Remember rather than send
-- ---------------------------------------------------------------------------

create or replace function app.note_job_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  what text[] := '{}';
begin
  if old.starts_at is distinct from new.starts_at then
    what := array_append(what, 'the date');
  end if;
  if old.on_site is distinct from new.on_site or old.wrapped is distinct from new.wrapped
     or old.camera_ready is distinct from new.camera_ready then
    what := array_append(what, 'the call times');
  end if;
  if old.venue is distinct from new.venue or old.city is distinct from new.city
     or old.maps_url is distinct from new.maps_url or old.parking is distinct from new.parking then
    what := array_append(what, 'the location');
  end if;
  if old.due_on is distinct from new.due_on then
    what := array_append(what, 'the deadline');
  end if;
  if old.briefing is distinct from new.briefing
     or old.expectations is distinct from new.expectations
     or old.shots is distinct from new.shots
     or old.equipment is distinct from new.equipment
     or old.dresscode is distinct from new.dresscode then
    what := array_append(what, 'the briefing');
  end if;
  if old.delivery is distinct from new.delivery
     or old.gallery_link is distinct from new.gallery_link then
    what := array_append(what, 'the delivery terms');
  end if;

  if array_length(what, 1) is null then return new; end if;

  -- Deduplicated: fixing the venue twice is one change to tell people about.
  new.unpublished_changes := (
    select coalesce(array_agg(distinct x), '{}')
    from unnest(new.unpublished_changes || what) as x
  );

  return new;
end;
$$;

drop trigger if exists notify_job_change on public.assignments;
drop function if exists app.notify_job_change();

create trigger note_job_change
  before update on public.assignments
  for each row execute function app.note_job_change();

-- A role's own times and briefing belong to the job it hangs off, so a change
-- there is a change to publish too.
create or replace function app.note_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  what text;
begin
  if old.on_site is distinct from new.on_site
     or old.wrapped is distinct from new.wrapped
     or old.camera_ready is distinct from new.camera_ready then
    what := 'the call times';
  elsif old.due_on is distinct from new.due_on then
    what := 'the deadline';
  elsif old.briefing is distinct from new.briefing
     or old.shots is distinct from new.shots
     or old.equipment is distinct from new.equipment
     or old.expectations is distinct from new.expectations then
    what := 'the briefing';
  elsif old.delivery is distinct from new.delivery then
    what := 'the delivery terms';
  elsif old.fee_cents is distinct from new.fee_cents then
    what := 'a fee';
  else
    return new;
  end if;

  update public.assignments a
  set unpublished_changes = (
    select coalesce(array_agg(distinct x), '{}')
    from unnest(a.unpublished_changes || array[what]) as x
  )
  where a.id = new.assignment_id;

  return new;
end;
$$;

create trigger note_role_change
  after update on public.assignment_roles
  for each row execute function app.note_role_change();

-- ---------------------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------------------

create or replace function public.publish_assignment(job_id uuid)
returns integer
returns null on null input
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changes text[];
  r record;
  sent int := 0;
begin
  if not app.is_staff() then
    raise exception 'Only FEM can publish changes' using errcode = '42501';
  end if;

  select unpublished_changes into changes
  from public.assignments where id = job_id;

  if changes is null or array_length(changes, 1) is null then
    return 0;
  end if;

  for r in
    select id, freelancer_id
    from public.assignment_roles
    where assignment_id = job_id and freelancer_id is not null and offered_at is not null
  loop
    perform app.queue(r.freelancer_id, 'job-changed',
      app.job_payload(r.id) || jsonb_build_object('changed', array_to_string(changes, ', ')));
    sent := sent + 1;
  end loop;

  update public.assignments
  set unpublished_changes = '{}',
      last_published_at = now()
  where id = job_id;

  insert into public.access_log (actor_id, action, subject_type, subject_id)
  values (auth.uid(), format('published: %s', array_to_string(changes, ', ')), 'assignment', job_id);

  return sent;
end;
$$;

revoke all on function public.publish_assignment(uuid) from public, anon;
grant execute on function public.publish_assignment(uuid) to authenticated;
