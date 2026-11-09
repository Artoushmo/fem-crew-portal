-- Two things from the first real job.
--
-- One person shooting stills, video and an interview on the same day had to
-- be three roles -- and a person can only be on a job once, so they could
-- only be booked on one of them. The craft list now has the combination, and
-- interview as a craft of its own.
--
-- And the gallery link says where the work goes. Nothing said what it should
-- look like: a link to a previous shoot does that faster than a paragraph of
-- briefing.

-- ---------------------------------------------------------------------------
-- Crafts
-- ---------------------------------------------------------------------------

alter type public.craft add value if not exists 'photo-videographer' after 'videographer';
alter type public.craft add value if not exists 'interview' after 'photo-videographer';

-- ---------------------------------------------------------------------------
-- A reference
-- ---------------------------------------------------------------------------

alter table public.assignments
  add column if not exists reference_link text;

comment on column public.assignments.reference_link is
  'Earlier work to match: a previous shoot, a moodboard. Rendered as a link, so it has to be one.';

-- Rendered as an href, like the gallery link, so held to the same rule.
alter table public.assignments
  drop constraint if exists assignments_reference_link_is_url;
alter table public.assignments
  add constraint assignments_reference_link_is_url
    check (reference_link is null or reference_link ~* '^https?://');

-- A new reference changes what the crew is asked to make, so it is a change
-- to the briefing and waits for Publish like the rest of it. Otherwise as in
-- 0026.
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
     or old.dresscode is distinct from new.dresscode
     or old.reference_link is distinct from new.reference_link then
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

-- PostgREST caches the schema; without this the new column is invisible to
-- the portal until the cache happens to refresh.
notify pgrst, 'reload schema';
