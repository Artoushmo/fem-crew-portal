-- Two findings from the database linter, and one deliberate non-fix.
--
-- app.touch_updated_at() runs as security definer with no search_path pinned.
-- That means it resolves now() and every operator through whatever schema list
-- the caller happens to have set. Nothing exploits it today, but a definer
-- function that looks up its own names at the caller's discretion is the shape
-- every search_path escalation takes. Every other function in this schema
-- already pins it; this one was missed.
alter function app.touch_updated_at() set search_path = public, pg_temp;

-- public.rls_auto_enable() is Supabase's own event trigger, which switches row
-- level security on for any table created in public. It is reachable over the
-- REST API only because it sits in an exposed schema -- calling it outside an
-- event trigger raises immediately, so it is noise rather than a hole. Revoked
-- anyway: an unauthenticated caller has no business seeing it in the API at
-- all, and silencing a warning that never mattered keeps the next real one
-- visible.
revoke execute on function public.rls_auto_enable() from anon, authenticated;

-- Deliberately left alone: list_members, my_access, set_member_role and
-- revoke_member_access are security definer *because* they have to be. Each one
-- reads or writes something the caller is not granted directly, and each checks
-- who is asking before it does -- app.is_superadmin() inside the function body,
-- not a policy on a table the function bypasses. Switching them to invoker
-- would not make them safer; it would make them fail.
