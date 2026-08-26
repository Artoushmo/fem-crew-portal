-- Restores the table privileges service_role normally has.
--
-- The project was created with "Automatically expose new tables" off, which is
-- the right setting: it stops a new table reaching the Data API by accident.
-- But it withholds grants from every role, service_role included — and while
-- that key bypasses row level security, it does not bypass a GRANT. The
-- invite-member function hit exactly that: "permission denied for table
-- profiles" from a key that supposedly can do anything.
--
-- anon and authenticated are untouched. They keep the narrow, explicit grants
-- from 0001 and 0002, which is what makes the public anon key safe to ship.

grant usage on schema public to service_role;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Tables added later should not need this file run again.
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;

alter default privileges in schema public
  grant all on functions to service_role;
