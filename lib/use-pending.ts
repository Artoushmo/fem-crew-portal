'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';

/** How much is outstanding, for the numbers on the rail.
 *
 * Deliberately "things to do" rather than "rows that exist". A badge that never
 * reaches zero is one people stop reading, and then it is worse than nothing.
 *
 * One small query, and row level security does the rest: a producer sees every
 * role, a freelancer only their own, and the same two counts mean the right
 * thing to each of them. */
export interface Pending {
  assignments: number;
  payments: number;
}

interface Row {
  freelancer_id: string | null;
  offered_at: string | null;
  accepted_at: string | null;
  stage: number;
  payment_state: string;
  assignments: { starts_at: string } | null;
}

export function usePending(): Pending {
  const { stage: authStage } = useAuth();
  const [pending, setPending] = useState<Pending>({ assignments: 0, payments: 0 });

  const load = useCallback(async () => {
    if (!supabase || authStage !== 'ready') return;

    const { data } = await supabase
      .from('assignment_roles')
      .select('freelancer_id, offered_at, accepted_at, stage, payment_state, assignments ( starts_at )');

    const rows = (data as unknown as Row[]) ?? [];
    const today = new Date(new Date().toDateString()).getTime();

    let assignments = 0;
    let payments = 0;

    for (const r of rows) {
      const startsAt = r.assignments?.starts_at;
      const upcoming = startsAt ? new Date(startsAt).getTime() >= today : false;

      // Nobody on it yet, or offered and still unanswered.
      if (!r.freelancer_id) {
        if (upcoming) assignments += 1;
      } else if (r.offered_at && !r.accepted_at && upcoming) {
        assignments += 1;
      }

      // Money in motion: an invoice waiting to be paid, or work delivered that
      // has not been invoiced yet.
      if (r.payment_state === 'awaiting') payments += 1;
      else if (r.payment_state !== 'paid' && r.stage >= 3) payments += 1;
    }

    setPending({ assignments, payments });
  }, [authStage]);

  useEffect(() => {
    load();
  }, [load]);

  // Something changed on another screen, or somebody else moved a step.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  return pending;
}
