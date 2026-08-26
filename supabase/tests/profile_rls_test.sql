-- Exercises every write the profile screen makes, as the signed-in user rather
-- than as postgres — which bypasses RLS and would prove nothing.
--
-- Rows created here are deleted again at the end, which also tests the delete
-- policy. Safe to re-run.

drop table if exists rls_result;

do $$
declare
  uid   uuid;
  steps text[] := '{}';
  e     text;
  tmp   uuid;
  probe_craft public.craft;
begin
  select id into uid from auth.users
  where email = 'info@snapbuildstudio.com';

  if uid is null then
    raise exception 'No auth user with that address — check the email in this script.';
  end if;

  -- Become that user: RLS reads auth.uid() from these claims, and the role
  -- switch is what makes the policies apply at all.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );
  execute 'set local role authenticated';

  -- 1. read own profile
  begin
    perform 1 from public.profiles;
    steps := array_append(steps, 'read own profile ....... OK');
  exception when others then
    get stacked diagnostics e = message_text;
    steps := array_append(steps, ('read own profile ....... FAIL: ' || e));
  end;

  -- 2. update own profile
  begin
    update public.profiles set base_city = coalesce(base_city, 'Amsterdam') where id = uid;
    steps := array_append(steps, 'update own profile ..... OK');
  exception when others then
    get stacked diagnostics e = message_text;
    steps := array_append(steps, ('update own profile ..... FAIL: ' || e));
  end;

  -- 3. role must stay out of reach
  begin
    update public.profiles set role = 'admin' where id = uid;
    steps := array_append(steps, 'block role change ...... FAIL: the update went through');
  exception when others then
    steps := array_append(steps, 'block role change ...... OK (refused)');
  end;

  -- 4. crafts — pick one the account does not already hold, so a real saved
  --    craft cannot trip the primary key and read as a policy failure.
  begin
    select c into probe_craft
    from unnest(enum_range(null::public.craft)) c
    where c not in (select craft from public.freelancer_crafts where profile_id = uid)
    limit 1;

    if probe_craft is null then
      steps := array_append(steps, 'insert + delete craft .. SKIPPED (all crafts already set)');
    else
      insert into public.freelancer_crafts (profile_id, craft, is_primary)
      values (uid, probe_craft, false);
      delete from public.freelancer_crafts where profile_id = uid and craft = probe_craft;
      steps := array_append(steps, 'insert + delete craft .. OK');
    end if;
  exception when others then
    get stacked diagnostics e = message_text;
    steps := array_append(steps, ('insert + delete craft .. FAIL: ' || e));
  end;

  -- 5. gear
  begin
    insert into public.gear (profile_id, category, brand, model)
    values (uid, 'camera', 'Test', 'RLS probe') returning id into tmp;
    delete from public.gear where id = tmp;
    steps := array_append(steps, 'insert + delete gear ... OK');
  exception when others then
    get stacked diagnostics e = message_text;
    steps := array_append(steps, ('insert + delete gear ... FAIL: ' || e));
  end;

  -- 6. credentials
  begin
    insert into public.credentials (profile_id, kind, label, expires_on)
    values (uid, 'drone-licence', 'RLS probe', current_date + 30) returning id into tmp;
    delete from public.credentials where id = tmp;
    steps := array_append(steps, 'insert + delete cred ... OK');
  exception when others then
    get stacked diagnostics e = message_text;
    steps := array_append(steps, ('insert + delete cred ... FAIL: ' || e));
  end;

  -- 7. availability
  begin
    insert into public.availability (profile_id, kind, starts_on, ends_on)
    values (uid, 'unavailable', current_date, current_date + 2) returning id into tmp;
    delete from public.availability where id = tmp;
    steps := array_append(steps, 'insert + delete avail .. OK');
  exception when others then
    get stacked diagnostics e = message_text;
    steps := array_append(steps, ('insert + delete avail .. FAIL: ' || e));
  end;

  -- 8. a freelancer must not reach the client list
  begin
    perform 1 from public.clients;
    steps := array_append(steps, 'clients hidden ......... OK (no rows visible)');
  exception when others then
    steps := array_append(steps, 'clients hidden ......... OK (refused)');
  end;

  reset role;

  create temp table rls_result as select unnest(steps) as check_result;
end $$;

select * from (
  select 1 as ord, check_result as uitkomst from rls_result
  union all
  select 2, '--- buckets ---'
  union all
  select 2, 'bucket: ' || id || '  (public=' || public::text || ')' from storage.buckets
  union all
  select 3, '--- storage policies ---'
  union all
  select 3, 'policy: ' || policyname || '  [' || cmd || ']'
  from pg_policies where schemaname = 'storage' and tablename = 'objects'
  union all
  select 4, '--- rls op storage.objects ---'
  union all
  select 4, 'row security enabled: ' || relrowsecurity::text
  from pg_class where relname = 'objects' and relnamespace = 'storage'::regnamespace
) q
order by ord, uitkomst;
