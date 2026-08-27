-- Letting an account find out what is being asked of it.
--
-- profiles is gated on app.mfa_satisfied(), which demands aal2 from staff. That
-- is correct, and it created a deadlock the moment a freelancer was promoted:
-- the portal reads the role from profiles to decide whether to demand a second
-- factor, but that read is already refused for lacking one. The role sits
-- behind the lock the role itself installs.
--
-- The symptom was a raw "Cannot coerce the result to a single JSON object" and
-- an empty portal -- the promotion looked like a bug in the profile screen.
--
-- security definer so it answers at aal1. It leaks nothing: every column is
-- about the caller, who already knows their own name, and knowing that you are
-- required to hold aal2 is not a secret worth keeping from the person being
-- required to hold it.

create or replace function public.my_access()
returns table (
  id            uuid,
  role          public.app_role,
  status        text,
  full_name     text,
  email         text,
  avatar_path   text,
  mfa_required  boolean,
  mfa_enrolled  boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.role,
    p.status,
    p.full_name,
    p.email,
    p.avatar_path,
    -- The same rule mfa_satisfied() applies, stated so the client can act on it
    -- before the refusal rather than after.
    (
      p.role in ('staff', 'admin', 'superadmin')
      or exists (
        select 1 from auth.mfa_factors f
        where f.user_id = p.id and f.status = 'verified'
      )
    ) as mfa_required,
    exists (
      select 1 from auth.mfa_factors f
      where f.user_id = p.id and f.status = 'verified'
    ) as mfa_enrolled
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;
