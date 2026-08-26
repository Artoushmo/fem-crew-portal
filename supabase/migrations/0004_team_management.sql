-- Team management without ever opening Supabase.
--
-- Two things a superadmin needs to do: change someone's role, and invite
-- someone who has no account yet. Only the second needs the admin API and its
-- service_role key, so only the second becomes an Edge Function. Role changes
-- stay here, in the database, where the rules are already enforced.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A superadmin is an admin with the run of the place, so anywhere that asks for
-- staff already includes them — is_staff() checks the role list below.
create or replace function app.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.user_role() = 'superadmin' and app.mfa_satisfied()
$$;

-- Widen staff to include the new tier.
create or replace function app.is_staff()
returns boolean
language sql
stable
as $$
  select app.user_role() in ('staff', 'admin', 'superadmin') and app.mfa_satisfied()
$$;

-- MFA is mandatory for everyone above freelancer.
create or replace function app.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when app.user_role() in ('staff', 'admin', 'superadmin')
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    when exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    else true
  end
$$;

-- ---------------------------------------------------------------------------
-- Changing a role
-- ---------------------------------------------------------------------------

-- security definer so it can write a column the client is not granted. Every
-- rule that makes this safe is checked inside, before the write.
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
  actor   uuid := auth.uid();
  old_role public.app_role;
begin
  if not app.is_superadmin() then
    raise exception 'Only a superadmin can change roles'
      using errcode = '42501';
  end if;

  -- Promoting yourself is how a compromised session becomes a compromised
  -- company. Someone else has to do it.
  if target_id = actor then
    raise exception 'You cannot change your own role'
      using errcode = '42501';
  end if;

  select role into old_role from public.profiles where id = target_id;

  if old_role is null then
    raise exception 'No such member' using errcode = 'P0002';
  end if;

  if old_role = new_role then
    return;
  end if;

  -- Losing the last superadmin means the only way back in is the Supabase
  -- dashboard, which is exactly what this feature exists to avoid.
  if old_role = 'superadmin' and new_role <> 'superadmin' then
    if (select count(*) from public.profiles where role = 'superadmin') <= 1 then
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

-- ---------------------------------------------------------------------------
-- Reading the team
-- ---------------------------------------------------------------------------

-- Staff already read every profile, but the team screen wants the roster with
-- sign-in state, which lives in auth.users and is not readable from the client.
create or replace function public.list_members()
returns table (
  id            uuid,
  email         text,
  full_name     text,
  role          public.app_role,
  avatar_path   text,
  base_city     text,
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
-- Removing access
-- ---------------------------------------------------------------------------

-- Deleting the auth user needs the admin API, so this only demotes: the account
-- survives, its reach does not. Assignment history stays intact, which is what
-- you want when a fee was paid against it.
create or replace function public.revoke_member_access(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_superadmin() then
    raise exception 'Only a superadmin can revoke access' using errcode = '42501';
  end if;

  if target_id = auth.uid() then
    raise exception 'You cannot revoke your own access' using errcode = '42501';
  end if;

  perform public.set_member_role(target_id, 'freelancer');
end;
$$;

revoke all on function public.revoke_member_access(uuid) from public, anon;
grant execute on function public.revoke_member_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed the first superadmin
-- ---------------------------------------------------------------------------

-- Chicken and egg: set_member_role requires a superadmin to exist. This is the
-- one time it is done directly, and the address is deliberately hard-coded so
-- it cannot be re-run to hand the tier to someone else.
update public.profiles
set role = 'superadmin'
where email = 'info@snapbuildstudio.com';
