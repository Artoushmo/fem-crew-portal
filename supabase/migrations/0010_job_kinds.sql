-- Not every job is a shoot.
--
-- The table was written for a shoot day: a venue, an on-site time, a camera
-- ready time, a wrap. FEM also sells web design, app design and edits, and none
-- of those have a call time -- they have a deadline. Forcing them into the shoot
-- shape meant inventing times nobody would keep, which is worse than no time at
-- all: a producer cannot tell an invented 12:30 from a real one.
--
-- So a job has a kind, and the fields that only make sense for one of them stop
-- being mandatory for both.

create type public.job_kind as enum ('shoot', 'project');

alter table public.assignments
  add column kind public.job_kind not null default 'shoot',
  add column due_on date;

comment on column public.assignments.due_on is
  'Deadline for a project. A shoot uses starts_at instead.';

-- A project has no venue and no call times.
alter table public.assignments
  alter column on_site     drop not null,
  alter column camera_ready drop not null,
  alter column wrapped     drop not null,
  alter column venue       drop not null,
  alter column city        drop not null;

-- Each kind still has to carry the thing that makes it schedulable. Without
-- this a project could be saved with no deadline and no call time and then sit
-- in a list with nothing to sort it by.
alter table public.assignments
  add constraint assignments_kind_shape check (
    case kind
      when 'shoot' then on_site is not null and wrapped is not null and venue is not null
      when 'project' then due_on is not null
    end
  );

-- Everything already in the table was entered as a shoot, and satisfies it.
