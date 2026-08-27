-- Who else is on the day, and who to call.
--
-- Both are on a call sheet, and row level security correctly refuses both: a
-- freelancer may read their own role and nothing else, so a plain query for the
-- other roles returns an empty crew list, and the producer's profile is closed
-- to them entirely.
--
-- Widening those policies would be the wrong fix. Sibling roles carry fees, and
-- a policy is row-level -- letting someone read the row to learn a colleague's
-- name also hands them that colleague's rate. This returns the two columns a
-- call sheet needs and leaves the rest where it is.

create or replace function public.shoot_people(shoot_id uuid)
returns table (
  kind       text,
  name       text,
  role_label text,
  phone      text,
  email      text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with allowed as (
    -- Only someone actually booked on this shoot, or FEM.
    select app.is_staff() or exists (
      select 1 from public.assignment_roles r
      where r.assignment_id = shoot_id
        and r.freelancer_id = auth.uid()
        and r.offered_at is not null
    ) as ok
  )
  -- The producer: reachable, because that is the whole point of the field.
  select
    'producer'::text,
    coalesce(p.full_name, 'Fast Elevate Media'),
    'Producer, FEM'::text,
    p.phone,
    p.email
  from public.assignments a
  join public.profiles p on p.id = a.producer_id
  where a.id = shoot_id and (select ok from allowed)

  union all

  -- Colleagues: name and what they are doing. No contact details, no fee.
  select
    'crew'::text,
    coalesce(c.full_name, 'Crew'),
    r.role_label,
    null::text,
    null::text
  from public.assignment_roles r
  join public.profiles c on c.id = r.freelancer_id
  where r.assignment_id = shoot_id
    and r.freelancer_id is not null
    and r.freelancer_id <> auth.uid()
    and r.offered_at is not null
    and (select ok from allowed);
$$;

revoke all on function public.shoot_people(uuid) from public, anon;
grant execute on function public.shoot_people(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The yearly agreement
-- ---------------------------------------------------------------------------

-- 0001 created the table; nothing has ever written to it, because signing lived
-- in the browser's localStorage. Signing is the gate on accepting an
-- assignment, so it has to survive a new laptop.
grant select, insert, update on public.agreements to authenticated;

drop policy if exists "freelancer reads own agreement" on public.agreements;
drop policy if exists "freelancer signs own agreement" on public.agreements;
drop policy if exists "staff read agreements" on public.agreements;

create policy "freelancer reads own agreement"
  on public.agreements for select
  to authenticated
  using (freelancer_id = auth.uid() and app.mfa_satisfied());

create policy "freelancer signs own agreement"
  on public.agreements for insert
  to authenticated
  with check (freelancer_id = auth.uid() and app.mfa_satisfied());

-- Unsigning is deliberately not offered: an agreement that can be withdrawn
-- from the same screen that signed it is not an agreement. FEM can clear one.
create policy "staff manage agreements"
  on public.agreements for all
  to authenticated
  using (app.is_staff())
  with check (app.is_staff());
