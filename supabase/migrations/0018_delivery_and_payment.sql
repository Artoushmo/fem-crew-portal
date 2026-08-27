-- Closing the two steps that only looked closed.
--
-- Step five said "Upload files" and uploaded nothing: the stage moved on and
-- FEM was told the work was delivered without being told where. Step nine had no
-- button at all -- the process says FEM confirms the payment, and nothing in the
-- portal could.
--
-- Delivery is a link, not an upload. A shoot day is tens of gigabytes and it
-- already travels by WeTransfer, Frame.io or a client's own drive. Asking the
-- portal to hold the files would be slower, more expensive and worse than what
-- crews already use; asking it to hold *where they went* is what was missing.

alter table public.assignment_roles
  add column delivery_link text,
  add column delivery_note text,
  add column delivered_at  timestamptz;

comment on column public.assignment_roles.delivery_link is
  'Where the work was delivered. The files live wherever the crew already sends them; this is the pointer FEM needs.';

-- ---------------------------------------------------------------------------
-- Only FEM confirms payment, and now it can
-- ---------------------------------------------------------------------------

-- The guard has always refused a freelancer setting payment_state to paid. What
-- was missing was the other half: a way for FEM to do it that also stamps the
-- date, so the two can never disagree.
create or replace function public.confirm_payment(role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_state public.payment_state;
begin
  if not app.is_staff() then
    raise exception 'Only FEM can confirm a payment' using errcode = '42501';
  end if;

  select payment_state into current_state
  from public.assignment_roles where id = role_id;

  if current_state is null then
    raise exception 'No such role' using errcode = 'P0002';
  end if;

  if current_state = 'paid' then
    return;
  end if;

  if current_state <> 'awaiting' then
    raise exception 'There is no invoice to pay yet' using errcode = '23514';
  end if;

  update public.assignment_roles
  set payment_state = 'paid',
      paid_on       = current_date,
      -- Paid is the last step; the tracker should say so rather than leaving
      -- someone on "invoice sent" forever.
      stage         = greatest(stage, 6),
      stage_dates   = coalesce(stage_dates, '{}'::jsonb)
                        || jsonb_build_object('6', to_char(current_date, 'YYYY-MM-DD'))
  where id = role_id;

  insert into public.access_log (actor_id, action, subject_type, subject_id)
  values (auth.uid(), 'payment confirmed', 'assignment_role', role_id);
end;
$$;

revoke all on function public.confirm_payment(uuid) from public, anon;
grant execute on function public.confirm_payment(uuid) to authenticated;
