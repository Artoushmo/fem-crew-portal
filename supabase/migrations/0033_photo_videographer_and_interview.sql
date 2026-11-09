-- One person shooting stills, video and an interview on the same day had to
-- be three roles -- and a person can only be on a job once, so they could only
-- be booked on one of them. The craft list now has the combination, and
-- interview as a craft of its own.
--
-- Run this before the portal ships the two crafts: picking one the database
-- does not know yet fails on save.

alter type public.craft add value if not exists 'photo-videographer' after 'videographer';
alter type public.craft add value if not exists 'interview' after 'photo-videographer';
