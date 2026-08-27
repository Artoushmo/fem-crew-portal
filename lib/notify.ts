'use client';

import { supabase } from './supabase';

/** Nudges the queue that the database triggers filled.

    Not a scheduler, on purpose. The messages are written in the same
    transaction as the change that caused them, so nothing is lost if this never
    runs -- it only decides how soon they leave. Any signed-in session kicking it
    on load is enough to keep the delay in seconds, and picks up whatever an
    interrupted call left behind.

    Never throws and never blocks the thing that triggered it: a booking that
    saved is still a booking if the mail is a minute late. */
export function drainNotifications(): void {
  if (!supabase) return;

  void supabase.functions
    .invoke('invite-member', { body: { action: 'notify' } })
    .catch(() => {
      /* the next call will pick these up */
    });
}
