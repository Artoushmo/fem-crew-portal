'use client';

import { useMemo } from 'react';
import { CRAFT_LABEL } from './profile-types';
import { useClients } from './use-clients';
import { useCrew } from './use-crew';
import { useShoots, type Role, type Shoot } from './use-staff-assignments';

/** Stage indices, named. Reading `stage >= 4` in three places is how a workflow
    quietly changes meaning; these are the same seven steps the freelancer walks. */
const STAGE = {
  contract: 0,
  accepted: 1,
  briefing: 2,
  shootDay: 3,
  uploaded: 4,
  invoiced: 5,
  paid: 6,
} as const;

export type Urgency = 'now' | 'soon' | 'later';

export interface Task {
  id: string;
  /** What to do, in the producer's words. */
  what: string;
  /** Which job, so the row can be found without opening anything. */
  where: string;
  when: string;
  urgency: Urgency;
  /** Days from today. Negative is overdue. Used only for sorting. */
  days: number;
  shootId: string;
}

export interface Money {
  committed: number;
  awaitingInvoice: number;
  awaitingPayment: number;
  paid: number;
}

function daysFrom(iso: string): number {
  const today = new Date(new Date().toDateString()).getTime();
  const then = new Date(new Date(iso).toDateString()).getTime();
  return Math.round((then - today) / 86400000);
}

function whenLabel(days: number): string {
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days === -1) return 'yesterday';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 14) return `in ${days} days`;
  return `in ${Math.round(days / 7)} weeks`;
}

/** An unfilled role three days out is a different problem from one three months
    out. Everything on this screen is sorted by that difference. */
function urgencyOf(days: number): Urgency {
  if (days <= 3) return 'now';
  if (days <= 14) return 'soon';
  return 'later';
}

function jobName(s: Shoot): string {
  return s.client_name ? `${s.title} - ${s.client_name}` : s.title;
}

function roleName(r: Role): string {
  return r.role_label || CRAFT_LABEL[r.craft];
}

/** Everything a producer's screen needs, derived from what is already loaded.
    No extra queries: the assignments, crew and clients hooks each hold the whole
    picture already, and a dashboard that fetched its own copy would be able to
    disagree with the page you clicked through to. */
export function useStaffDashboard() {
  const { shoots, loading: shootsLoading, error: shootsError, reload } = useShoots();
  const { crew, loading: crewLoading } = useCrew(null);
  const { clients, loading: clientsLoading } = useClients();

  const tasks = useMemo<Task[]>(() => {
    const out: Task[] = [];

    for (const s of shoots) {
      const days = daysFrom(s.starts_at);
      const past = days < 0;

      for (const r of s.roles) {
        const base = { shootId: s.id, where: jobName(s), when: whenLabel(days), days };

        // Nobody booked, and the day is coming.
        if (!r.freelancer_id) {
          if (!past) {
            out.push({
              ...base,
              id: `open-${r.id}`,
              what: `Book a ${CRAFT_LABEL[r.craft].toLowerCase()}`,
              urgency: urgencyOf(days),
            });
          }
          continue;
        }

        // Offered and still silent. The closer the day, the worse the silence.
        if (r.offered_at && !r.accepted_at && r.stage < STAGE.accepted && !past) {
          out.push({
            ...base,
            id: `accept-${r.id}`,
            what: `${r.freelancer_name ?? roleName(r)} has not accepted yet`,
            urgency: urgencyOf(days),
          });
        }

        // The day has passed and the files never arrived.
        if (past && r.stage < STAGE.uploaded) {
          out.push({
            ...base,
            id: `deliver-${r.id}`,
            what: `${r.freelancer_name ?? roleName(r)} has not delivered`,
            urgency: 'now',
          });
        }

        // Delivered, invoice sent, money still out.
        if (r.payment_state === 'awaiting') {
          out.push({
            ...base,
            id: `pay-${r.id}`,
            what: `Pay ${r.freelancer_name ?? roleName(r)}`,
            urgency: days < -30 ? 'now' : 'soon',
          });
        }
      }
    }

    // Most urgent first, and within that whatever happens soonest.
    const rank: Record<Urgency, number> = { now: 0, soon: 1, later: 2 };
    return out.sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.days - b.days);
  }, [shoots]);

  /** The next two weeks, in order, with who is on each. */
  const upcoming = useMemo(
    () =>
      shoots
        .filter((s) => {
          const d = daysFrom(s.starts_at);
          return d >= 0 && d <= 14;
        })
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [shoots],
  );

  const money = useMemo<Money>(() => {
    const m: Money = { committed: 0, awaitingInvoice: 0, awaitingPayment: 0, paid: 0 };

    for (const s of shoots) {
      for (const r of s.roles) {
        if (!r.freelancer_id) continue;
        m.committed += r.fee_cents;
        if (r.payment_state === 'paid') m.paid += r.fee_cents;
        else if (r.payment_state === 'awaiting') m.awaitingPayment += r.fee_cents;
        else if (r.stage >= STAGE.uploaded) m.awaitingInvoice += r.fee_cents;
      }
    }

    return m;
  }, [shoots]);

  const crewHealth = useMemo(() => {
    // Someone with no craft listed cannot be matched to anything. They will
    // never appear in a picker, and nobody would know why.
    const unmatchable = crew.filter((m) => m.crafts.length === 0);
    const noKit = crew.filter((m) => m.crafts.length > 0 && m.gear_count === 0);

    return { total: crew.length, unmatchable, noKit };
  }, [crew]);

  const openRoles = useMemo(
    () =>
      shoots
        .filter((s) => daysFrom(s.starts_at) >= 0)
        .reduce((n, s) => n + s.roles.filter((r) => !r.freelancer_id).length, 0),
    [shoots],
  );

  return {
    loading: shootsLoading || crewLoading || clientsLoading,
    error: shootsError,
    reload,
    tasks,
    upcoming,
    money,
    crewHealth,
    clients,
    shoots,
    openRoles,
  };
}

export { daysFrom, whenLabel, jobName };
