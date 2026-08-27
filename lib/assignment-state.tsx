'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  agreement as baseAgreement,
  assignments as baseAssignments,
  buildActionQueue,
  type Assignment,
  type PaymentState,
} from './assignments';
import { isAuthConfigured } from './supabase';
import { useMyAssignments } from './use-my-assignments';

/** Everything the freelancer has changed, on top of the seed data. There is no
    backend yet, so progress lives in localStorage — enough to click the whole
    workflow through and see each step's consequences. */
interface Progress {
  stages: Record<string, number>;
  dates: Record<string, Record<number, string>>;
  payments: Record<string, PaymentState>;
  files: Record<string, number>;
  agreementSigned?: boolean;
  agreementSignedOn?: string;
}

const EMPTY: Progress = { stages: {}, dates: {}, payments: {}, files: {} };
const STORAGE_KEY = 'fem.progress.v1';

export function today() {
  return new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Ctx {
  assignments: Assignment[];
  agreement: { id: string | null; year: number; signed: boolean; signedOn: string };
  /** False until the source has answered, so the server and first client render
      agree. */
  ready: boolean;
  /** Only ever set on the live path. Demo has nothing to fail at. */
  error: string | null;
  /** True when this is real work rather than the sample set. */
  live: boolean;
  advance: (id: string) => void;
  signAgreement: () => void;
  /** Records this person's signature on the job's own contract, where there is
      one. A no-op in demo, which has no paperwork behind it. */
  signContract: (id: string) => void;
  /** A short-lived link to that contract. */
  contractUrl: (id: string) => Promise<string>;
  unsignAgreement: () => void;
  reset: () => void;
}

const AssignmentContext = createContext<Ctx | null>(null);

/** Two sources, one shape. Signed in, the freelancer's work comes from the
    database; without Supabase configured the portal still opens on the sample
    set so the whole workflow can be clicked through.

    Both hooks run on every render because hooks must -- the unused one just
    returns nothing and costs a state slot. Branching the tree instead would
    remount every screen the moment a session resolved. */
export function AssignmentProvider({ children }: { children: React.ReactNode }) {
  const live = useMyAssignments();

  if (isAuthConfigured) return <LiveProvider live={live}>{children}</LiveProvider>;
  return <DemoProvider>{children}</DemoProvider>;
}

function LiveProvider({
  live,
  children,
}: {
  live: ReturnType<typeof useMyAssignments>;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      assignments: live.assignments,
      agreement: live.agreement,
      ready: live.ready,
      error: live.error,
      live: true,
      advance: live.advance,
      signAgreement: live.signAgreement,
      signContract: live.signContract,
      contractUrl: live.contractUrl,
      // Nothing to undo against a database: an agreement you can withdraw from
      // the screen that signed it is not an agreement.
      unsignAgreement: () => {},
      reset: () => {},
    }),
    [live],
  );

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

function DemoProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setProgress({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* unreadable storage just means we start from the seed data */
    }
    setReady(true);
  }, []);

  const save = useCallback((next: Progress) => {
    setProgress(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* not fatal — the change still applies for this session */
    }
  }, []);

  const assignments = useMemo(
    () =>
      baseAssignments.map((a) => {
        const stage = progress.stages[a.id] ?? a.stage;
        const extraDates = progress.dates[a.id] ?? {};
        const paymentState = progress.payments[a.id] ?? a.payment.state;

        return {
          ...a,
          stage,
          stageDates: a.stageDates.map((d, i) => extraDates[i] ?? d),
          status: deriveStatus(a, stage, paymentState),
          nextAction: NEXT_ACTION[stage] ?? a.nextAction,
          payment: {
            ...a.payment,
            state: paymentState,
            ...(paymentState !== a.payment.state && paymentState === 'awaiting'
              ? { invoiceNumber: invoiceNumberFor(a), invoicedOn: extraDates[5] }
              : {}),
          },
          files: a.files.slice(0, a.files.length + (progress.files[a.id] ?? 0)),
        } satisfies Assignment;
      }),
    [progress],
  );

  const agreement = useMemo(
    () => ({
      id: null,
      year: baseAgreement.year,
      signed: progress.agreementSigned ?? baseAgreement.signed,
      signedOn: progress.agreementSignedOn ?? baseAgreement.signedOn,
    }),
    [progress],
  );

  const advance = useCallback(
    (id: string) => {
      const current = assignments.find((a) => a.id === id);
      if (!current || current.stage >= 6) return;

      const nextStage = current.stage + 1;
      const stamp = today();

      save({
        ...progress,
        stages: { ...progress.stages, [id]: nextStage },
        dates: {
          ...progress.dates,
          // The stage just completed is the one that gets today's date.
          [id]: { ...(progress.dates[id] ?? {}), [current.stage]: stamp },
        },
        // Sending the invoice is the one step that also moves the money on.
        payments:
          current.stage === 5
            ? { ...progress.payments, [id]: 'awaiting' }
            : progress.payments,
      });
    },
    [assignments, progress, save],
  );

  const signAgreement = useCallback(() => {
    save({ ...progress, agreementSigned: true, agreementSignedOn: today() });
  }, [progress, save]);

  const unsignAgreement = useCallback(() => {
    save({ ...progress, agreementSigned: false, agreementSignedOn: undefined });
  }, [progress, save]);

  const reset = useCallback(() => {
    setProgress(EMPTY);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      // Shot and kit ticks belong to the same demo run.
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('fem.shots.') || k.startsWith('fem.kit.'))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* nothing to clear */
    }
  }, []);

  const value = useMemo(
    () => ({
      assignments,
      agreement,
      ready,
      error: null,
      live: false,
      advance,
      signAgreement,
      signContract: () => {},
      contractUrl: async () => {
        throw new Error('The sample assignments have no contract attached.');
      },
      unsignAgreement,
      reset,
    }),
    [assignments, agreement, ready, advance, signAgreement, unsignAgreement, reset],
  );

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

function useCtx() {
  const ctx = useContext(AssignmentContext);
  if (!ctx) throw new Error('Wrap the tree in <AssignmentProvider>');
  return ctx;
}

export function useAssignments() {
  return useCtx().assignments;
}

export function useAssignment(id: string) {
  return useCtx().assignments.find((a) => a.id === id);
}

export function useAgreement() {
  return useCtx().agreement;
}

export function useProgressActions() {
  const { advance, signAgreement, signContract, contractUrl, unsignAgreement, reset, ready, error, live } =
    useCtx();
  return { advance, signAgreement, signContract, contractUrl, unsignAgreement, reset, ready, error, live };
}

export function useActionQueue() {
  const { assignments, agreement } = useCtx();
  return useMemo(
    () => buildActionQueue(assignments, agreement.signed, agreement.year),
    [assignments, agreement],
  );
}

const NEXT_ACTION: Record<number, string> = {
  0: 'Sign your agreement',
  1: 'Accept assignment',
  2: 'Review briefing',
  3: 'Shoot day',
  4: 'Upload your files',
  5: 'Send your invoice',
  6: 'Awaiting payment',
};

function deriveStatus(base: Assignment, stage: number, payment: PaymentState) {
  if (stage >= 6 && payment === 'paid') return 'completed' as const;
  if (stage >= 6) return 'delivered' as const;
  if (stage >= 4) return 'delivered' as const;
  if (stage <= 1) return 'action-required' as const;
  if (stage === 3) return 'in-progress' as const;
  return base.status === 'completed' ? 'confirmed' : ('confirmed' as const);
}

function invoiceNumberFor(a: Assignment) {
  const n = Math.abs([...a.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 900;
  return `FEM-${new Date().getFullYear()}-${String(100 + n).padStart(4, '0')}`;
}
