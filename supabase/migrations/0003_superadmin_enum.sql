-- Adds the superadmin tier. On its own, because Postgres will not let a new
-- enum value be used in the same transaction that adds it — every policy or
-- function referencing 'superadmin' has to wait for 0004.

alter type public.app_role add value if not exists 'superadmin';
