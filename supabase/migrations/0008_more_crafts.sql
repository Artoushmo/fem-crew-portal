-- What FEM actually sells.
--
-- The craft list was written for a shoot day. It has to cover the rest of the
-- work too, or every non-camera job lands on 'Any' -- and 'Any' is invisible in
-- a dashboard: you cannot count what still needs an editor if editors were
-- never named.
--
-- Its own file because Postgres will not let a new enum value be used in the
-- transaction that adds it, and 0009 uses these.

alter type public.craft add value if not exists 'web-design';
alter type public.craft add value if not exists 'app-design';
alter type public.craft add value if not exists 'motion-design';
alter type public.craft add value if not exists 'photo-editor';
