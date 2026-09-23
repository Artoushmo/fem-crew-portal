-- Somebody at FEM who also shoots.
--
-- The way round this was being solved is two accounts for one person: one to
-- produce with, one to be booked on. That splits everything that should be
-- single -- their kit list, their certificates, their signed agreement, their
-- invoice history -- and puts two of them in the team list.
--
-- So a profile keeps one role and gains a second hat. Charles produces and
-- sometimes shoots; he is one person, one profile, one agreement, and the
-- portal lets him switch which hat he is wearing.

alter table public.profiles
  add column can_freelance boolean not null default false;

comment on column public.profiles.can_freelance is
  'Someone at FEM who can also be booked as crew. Always true for freelancers.';

-- A freelancer is bookable by definition; the flag only says anything about the
-- people whose role is something else.
update public.profiles set can_freelance = true where role = 'freelancer';

create or replace function app.is_bookable(who uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = who
      and p.status = 'active'
      and (p.role = 'freelancer' or p.can_freelance)
  );
$$;

-- ---------------------------------------------------------------------------
-- Booking one of your own
-- ---------------------------------------------------------------------------

create or replace function app.require_agreement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.freelancer_id is not null
     and (tg_op = 'INSERT' or old.freelancer_id is distinct from new.freelancer_id) then

    if not app.is_bookable(new.freelancer_id) then
      raise exception 'That account cannot be booked as crew'
        using errcode = '42501';
    end if;

    -- The agreement is about doing the work, so it applies to whoever is doing
    -- it -- including somebody who spends the rest of their week producing.
    if not app.has_signed_agreement(new.freelancer_id) then
      raise exception 'They have not signed this year''s Freelancer Agreement yet'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.stage > old.stage
     and new.freelancer_id is not null
     and not app.has_signed_agreement(new.freelancer_id) then
    raise exception 'Sign this year''s Freelancer Agreement before taking this on'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who the team list shows, and who may set the flag
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
  can_freelance boolean,
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
    p.id, p.email, p.full_name, p.role, p.avatar_path, p.base_city, p.status,
    p.can_freelance,
    p.revoked_at,
    exists (
      select 1 from auth.mfa_factors f
      where f.user_id = p.id and f.status = 'verified'
    ),
    u.last_sign_in_at,
    u.invited_at,
    u.last_sign_in_at is not null
  from public.profiles p
  join auth.users u on u.id = p.id
  where app.is_staff()
  order by
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

-- Nobody sets this on themselves: giving yourself a second hat is how one
-- person ends up booking and paying their own work unobserved.
create or replace function public.set_member_freelancing(target_id uuid, allowed boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_superadmin() then
    raise exception 'Only a superadmin can change this' using errcode = '42501';
  end if;

  if target_id = auth.uid() then
    raise exception 'Someone else has to do this for you' using errcode = '42501';
  end if;

  update public.profiles set can_freelance = allowed where id = target_id;

  insert into public.access_log (actor_id, action, subject_type, subject_id)
  values (
    auth.uid(),
    case when allowed then 'can now be booked as crew' else 'no longer bookable as crew' end,
    'profile',
    target_id
  );
end;
$$;

revoke all on function public.set_member_freelancing(uuid, boolean) from public, anon;
grant execute on function public.set_member_freelancing(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- What the portal needs to know about you
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: the return type gains a column, and Postgres
-- will not change one in place.
drop function if exists public.my_access();

create function public.my_access()
returns table (
  id            uuid,
  role          public.app_role,
  status        text,
  full_name     text,
  email         text,
  avatar_path   text,
  mfa_required  boolean,
  mfa_enrolled  boolean,
  can_freelance boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id, p.role, p.status, p.full_name, p.email, p.avatar_path,
    (
      p.role in ('staff', 'admin', 'superadmin')
      or exists (
        select 1 from auth.mfa_factors f
        where f.user_id = p.id and f.status = 'verified'
      )
    ),
    exists (
      select 1 from auth.mfa_factors f
      where f.user_id = p.id and f.status = 'verified'
    ),
    p.can_freelance
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;
