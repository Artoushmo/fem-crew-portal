-- Ending someone's access, for real.
--
-- 0004 shipped revoke_member_access() as a demotion to 'freelancer'. That is
-- worse than doing nothing: the account still signs in, and the person who just
-- left the company now sits in the crew list as bookable. This replaces it.
--
-- Deleting the row is not the answer either -- assignments reference the
-- profile, fees were paid against it, and an invoice needs the name that was on
-- it. So access ends and the history stays: the profile is marked revoked, and
-- the auth user is banned and signed out by the invite-member function, which
-- is the only place holding the service_role key.
--
-- Two layers, deliberately. The ban is what actually stops a sign-in. The
-- status column is what every future query filters on, so a revoked profile
-- never turns up in matching, and what the team screen renders.

-- ---------------------------------------------------------------------------
-- Status
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists status text not null default 'active'
    check (status in ('active', 'revoked')),
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null;

create index if not exists profiles_status_idx on public.profiles (status);

-- Nobody may set this from the browser. It moves only through the function that
-- also bans the auth user, so the two can never disagree.
revoke update (status, revoked_at, revoked_by) on public.profiles from authenticated, anon;

-- ---------------------------------------------------------------------------
-- A revoked profile is not a member
-- ---------------------------------------------------------------------------

-- Folded in here rather than into every policy: is_staff() is already the gate
-- on every staff-side read, so a revoked admin loses that reach the moment the
-- flag flips, without waiting for their token to expire.
create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    app.user_role() in ('staff', 'admin', 'superadmin')
    and app.mfa_satisfied()
    and coalesce(
      (select status from public.profiles where id = auth.uid()), 'active'
    ) = 'active'
$$;

create or replace function app.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    app.user_role() = 'superadmin'
    and app.mfa_satisfied()
    and coalesce(
      (select status from public.profiles where id = auth.uid()), 'active'
    ) = 'active'
$$;

-- ---------------------------------------------------------------------------
-- The team screen needs to see who is out
-- ---------------------------------------------------------------------------

drop function if exists public.list_members();

create function public.list_members()
returns table (
  id            uuid,
  email         text,
  full_name     text,
  role          public.app_role,
  avatar_path   text,
  base_city     text,
  status        text,
  revoked_at    timestamptz,
  mfa_enrolled  boolean,
  last_sign_in  timestamptz,
  invited_at    timestamptz,
  accepted      boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.avatar_path,
    p.base_city,
    p.status,
    p.revoked_at,
    exists (
      select 1 from auth.mfa_factors f
      where f.user_id = p.id and f.status = 'verified'
    ) as mfa_enrolled,
    u.last_sign_in_at,
    u.invited_at,
    u.last_sign_in_at is not null as accepted
  from public.profiles p
  join auth.users u on u.id = p.id
  where app.is_staff()
  order by
    -- Revoked people sink to the bottom of their section: still findable, never
    -- in the way.
    (p.status = 'revoked'),
    case p.role
      when 'superadmin' then 0
      when 'admin' then 1
      when 'staff' then 2
      else 3
    end,
    coalesce(p.full_name, p.email);
$$;

revoke all on function public.list_members() from public, anon;
grant execute on function public.list_members() to authenticated;

-- ---------------------------------------------------------------------------
-- Retire the old one
-- ---------------------------------------------------------------------------

-- Left callable on purpose, and made loud. Something in a browser tab may still
-- be holding the old client code, and silently demoting someone is the exact
-- failure this migration exists to end.
create or replace function public.revoke_member_access(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception
    'Revoking moved to the invite-member function so the auth user is banned too. Reload the portal.'
    using errcode = '0A000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Changing a role should not quietly resurrect someone
-- ---------------------------------------------------------------------------

create or replace function public.set_member_role(
  target_id uuid,
  new_role  public.app_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor       uuid := auth.uid();
  old_role    public.app_role;
  old_status  text;
begin
  if not app.is_superadmin() then
    raise exception 'Only a superadmin can change roles'
      using errcode = '42501';
  end if;

  if target_id = actor then
    raise exception 'You cannot change your own role'
      using errcode = '42501';
  end if;

  select role, status into old_role, old_status
  from public.profiles where id = target_id;

  if old_role is null then
    raise exception 'No such member' using errcode = 'P0002';
  end if;

  if old_status = 'revoked' then
    raise exception 'Their access was ended. Restore it first, then set the role.'
      using errcode = '42501';
  end if;

  if old_role = new_role then
    return;
  end if;

  if old_role = 'superadmin' and new_role <> 'superadmin' then
    if (select count(*) from public.profiles
        where role = 'superadmin' and status = 'active') <= 1 then
      raise exception 'That is the only superadmin left'
        using errcode = '23514';
    end if;
  end if;

  update public.profiles set role = new_role where id = target_id;

  insert into public.access_log (actor_id, action, subject_type, subject_id)
  values (actor, format('role: %s -> %s', old_role, new_role), 'profile', target_id);
end;
$$;

revoke all on function public.set_member_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_member_role(uuid, public.app_role) to authenticated;
