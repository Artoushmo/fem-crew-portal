-- A name on a list of six is not a face on a set.
--
-- The team table named everyone and showed nobody. The photo is already on
-- the profile; shoot_people hands it over so the table can show it. Nothing
-- else about who sees what changes.

drop function if exists public.shoot_people(uuid);

-- One row per person per day they are on, with the hours they are wanted that
-- day. A deadline-only job has no days and gives one row per person with no
-- day. The producer and the client have no day either.
create function public.shoot_people(shoot_id uuid)
returns table (
  kind       text,
  name       text,
  role_label text,
  day        date,
  on_site    time,
  wrapped    time,
  is_lead    boolean,
  is_you     boolean,
  phone      text,
  email      text,
  avatar_path text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select
      app.is_staff() as staff,
      exists (
        select 1 from public.assignment_roles r
        where r.assignment_id = shoot_id
          and r.freelancer_id = auth.uid()
          and r.offered_at is not null
      ) as booked,
      exists (
        select 1 from public.assignment_roles r
        where r.assignment_id = shoot_id
          and r.freelancer_id = auth.uid()
          and r.offered_at is not null
          and r.is_lead
      ) as lead
  ),
  crew as (
    select r.id, r.role_label, r.is_lead, r.freelancer_id, r.on_site, r.wrapped,
           c.full_name, c.phone, c.email, c.avatar_path
    from public.assignment_roles r
    join public.profiles c on c.id = r.freelancer_id
    where r.assignment_id = shoot_id
      and r.freelancer_id is not null
      and r.offered_at is not null
  ),
  days as (
    select d.id, d.day, d.on_site, d.wrapped
    from public.assignment_days d
    where d.assignment_id = shoot_id
  )

  select
    'producer'::text,
    coalesce(p.full_name, 'Fast Elevate Media'),
    'Producer, FEM'::text,
    null::date, null::time, null::time,
    false, false,
    p.phone,
    p.email,
    p.avatar_path
  from public.assignments a
  join public.profiles p on p.id = a.producer_id
  where a.id = shoot_id and (select staff or booked from me)

  union all

  -- Per day. Hours: the person's for that day, else the person's for the
  -- job, else the day's, else the job's.
  select
    'crew'::text,
    coalesce(cr.full_name, 'Crew'),
    cr.role_label,
    d.day,
    coalesce(rd.on_site, cr.on_site, d.on_site, a.on_site),
    coalesce(rd.wrapped, cr.wrapped, d.wrapped, a.wrapped),
    cr.is_lead,
    cr.freelancer_id = auth.uid(),
    case when (select staff or lead from me) then cr.phone end,
    case when (select staff or lead from me) then cr.email end,
    cr.avatar_path
  from crew cr
  cross join days d
  join public.assignments a on a.id = shoot_id
  left join public.assignment_role_days rd on rd.role_id = cr.id and rd.day_id = d.id
  where coalesce(rd.present, true)
    and (select staff or booked from me)

  union all

  -- No days: a deadline job. Everyone once, no hours.
  select
    'crew'::text,
    coalesce(cr.full_name, 'Crew'),
    cr.role_label,
    null::date, null::time, null::time,
    cr.is_lead,
    cr.freelancer_id = auth.uid(),
    case when (select staff or lead from me) then cr.phone end,
    case when (select staff or lead from me) then cr.email end,
    cr.avatar_path
  from crew cr
  where not exists (select 1 from days)
    and (select staff or booked from me)

  union all

  select
    'client'::text,
    coalesce(cl.contact_name, cl.name),
    cl.name,
    null::date, null::time, null::time,
    false, false,
    cl.contact_phone,
    cl.contact_email,
    null::text
  from public.assignments a
  join public.clients cl on cl.id = a.client_id
  where a.id = shoot_id
    and cl.contact_name is not null
    and (select staff or lead from me);
$$;

revoke all on function public.shoot_people(uuid) from public, anon;
grant execute on function public.shoot_people(uuid) to authenticated;

