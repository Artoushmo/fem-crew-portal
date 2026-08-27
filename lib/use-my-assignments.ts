'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import type { Assignment, PaymentState, Status } from './assignments';
import { recordSignature } from './signing';
import { requireSupabase, supabase } from './supabase';

/** The freelancer's own work, read from the database and shaped into the
    Assignment the screens already render.

    The mapping is deliberate rather than a rename: a freelancer's unit of work
    is the *role*, not the shoot. Two people on one launch each walk their own
    seven steps and send their own invoice, so the id here is the role's -- the
    shoot is the context around it. */

const COLUMNS = `
  id, craft, role_label, fee_cents, status, stage, stage_dates,
  payment_state, invoice_number, invoiced_on, paid_on, offered_at, accepted_at,
  contract_signed_on, reopened_reason,
  assignments (
    id, kind, title, starts_at, due_on, on_site, camera_ready, wrapped,
    city, venue, maps_url, travel, parking, briefing, expectations, shots,
    equipment, dresscode, client_notes, delivery, contract_path, contract_name,
    clients ( name ),
    assignment_files ( name, kind, size_label )
  )
`;

interface RawRole {
  id: string;
  role_label: string;
  fee_cents: number;
  status: Status;
  stage: number;
  stage_dates: Record<string, string> | null;
  payment_state: PaymentState;
  invoice_number: string | null;
  invoiced_on: string | null;
  paid_on: string | null;
  contract_signed_on: string | null;
  reopened_reason: string | null;
  offered_at: string | null;
  accepted_at: string | null;
  assignments: {
    id: string;
    kind: 'shoot' | 'project';
    title: string;
    starts_at: string;
    due_on: string | null;
    on_site: string | null;
    camera_ready: string | null;
    wrapped: string | null;
    city: string | null;
    venue: string | null;
    maps_url: string | null;
    travel: string | null;
    parking: string | null;
    briefing: string | null;
    expectations: string[] | null;
    shots: string[] | null;
    equipment: string[] | null;
    dresscode: string | null;
    client_notes: string | null;
    contract_path: string | null;
    contract_name: string | null;
    delivery: Record<string, string> | null;
    clients: { name: string } | null;
    assignment_files: { name: string; kind: string; size_label: string | null }[] | null;
  } | null;
}

interface Person {
  kind: 'producer' | 'crew';
  name: string;
  role_label: string;
  phone: string | null;
  email: string | null;
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

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function deriveStatus(stage: number, payment: PaymentState): Status {
  if (stage >= 6 && payment === 'paid') return 'completed';
  if (stage >= 4) return 'delivered';
  if (stage <= 1) return 'action-required';
  if (stage === 3) return 'in-progress';
  return 'confirmed';
}

/** stage_dates is stored keyed by stage index, so a stage completed out of the
    usual order still lands on its own step rather than shifting the rest. */
function toStageDates(raw: Record<string, string> | null): (string | null)[] {
  return Array.from({ length: 7 }, (_, i) => {
    const v = raw?.[String(i)];
    return v ? shortDate(v) : null;
  });
}

function timeOf(t: string | null, fallback: string): string {
  return t ? t.slice(0, 5) : fallback;
}

function toAssignment(row: RawRole, people: Person[]): Assignment | null {
  const s = row.assignments;
  if (!s) return null;

  const producer = people.find((p) => p.kind === 'producer');
  const crew = people.filter((p) => p.kind === 'crew');

  const onSite = timeOf(s.on_site, '09:00');
  const wrapped = timeOf(s.wrapped, '17:00');
  const day = s.starts_at.slice(0, 10);

  return {
    id: row.id,
    title: s.title,
    client: s.clients?.name ?? 'Fast Elevate Media',
    startsAt: s.starts_at,
    dateLabel: dayLabel(s.starts_at),
    onSite,
    cameraReady: timeOf(s.camera_ready, onSite),
    wrapped,
    city: s.city ?? '',
    venue: s.venue ?? (s.kind === 'project' ? 'Remote' : ''),
    mapsUrl: s.maps_url ?? '',
    travel: s.travel ?? '',
    parking: s.parking ?? '',
    role: row.role_label,
    fee: row.fee_cents / 100,
    contract: s.contract_path
      ? {
          name: s.contract_name ?? 'Contract',
          signedOn: row.contract_signed_on ? shortDate(row.contract_signed_on) : null,
        }
      : null,
    reopened: row.reopened_reason,
    status: deriveStatus(row.stage, row.payment_state),
    stage: row.stage,
    stageDates: toStageDates(row.stage_dates),
    nextAction: NEXT_ACTION[row.stage] ?? '',
    contact: {
      name: producer?.name ?? 'Fast Elevate Media',
      role: producer?.role_label ?? 'Producer, FEM',
      phone: producer?.phone ?? '',
      email: producer?.email ?? '',
    },
    crew: crew.map((c) => `${c.name} — ${c.role_label.toLowerCase()}`),
    briefing: s.briefing ?? '',
    expectations: s.expectations ?? [],
    shots: s.shots ?? [],
    equipment: s.equipment ?? [],
    dresscode: s.dresscode ?? '',
    clientNotes: s.client_notes ?? '',
    files: (s.assignment_files ?? []).map((f) => ({
      name: f.name,
      kind: f.kind,
      size: f.size_label ?? '',
    })),
    delivery: {
      firstSelection: s.delivery?.firstSelection ?? '',
      fullEdit: s.delivery?.fullEdit ?? '',
      format: s.delivery?.format ?? '',
      retention: s.delivery?.retention ?? '',
    },
    payment: {
      state: row.payment_state,
      ...(row.invoice_number ? { invoiceNumber: row.invoice_number } : {}),
      ...(row.invoiced_on ? { invoicedOn: shortDate(row.invoiced_on) } : {}),
      ...(row.paid_on ? { paidOn: shortDate(row.paid_on) } : {}),
    },
    calendar: {
      start: `${day}T${onSite}:00`,
      end: `${day}T${wrapped}:00`,
    },
  };
}

function invoiceNumber(roleId: string): string {
  const n = Math.abs([...roleId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 9000;
  return `FEM-${new Date().getFullYear()}-${String(1000 + n)}`;
}

export interface MyAgreement {
  /** Null until it has been signed. The signing receipt hangs off this row. */
  id: string | null;
  year: number;
  signed: boolean;
  signedOn: string;
}

export function useMyAssignments() {
  const { session, stage: authStage } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [agreement, setAgreement] = useState<MyAgreement>({
    id: null,
    year: new Date().getFullYear(),
    signed: false,
    signedOn: '',
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!supabase || authStage !== 'ready' || !uid) return;
    setError(null);

    const year = new Date().getFullYear();

    const [roles, signed] = await Promise.all([
      supabase
        .from('assignment_roles')
        .select(COLUMNS)
        .eq('freelancer_id', uid)
        .not('offered_at', 'is', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('agreements')
        .select('id, year, signed_on')
        .eq('freelancer_id', uid)
        .eq('year', year)
        .maybeSingle(),
    ]);

    if (roles.error) {
      setError(roles.error.message);
      setReady(true);
      return;
    }

    const rows = (roles.data as unknown as RawRole[]) ?? [];

    // One call per shoot for the people on it. Colleagues and the producer are
    // both closed to a freelancer by row level security, and rightly so: the
    // sibling role that carries a name also carries a rate.
    const peopleByShoot = new Map<string, Person[]>();
    await Promise.all(
      [...new Set(rows.map((r) => r.assignments?.id).filter(Boolean))].map(async (id) => {
        const { data } = await supabase!.rpc('shoot_people', { shoot_id: id });
        peopleByShoot.set(id as string, (data as Person[]) ?? []);
      }),
    );

    setAssignments(
      rows
        .map((r) => toAssignment(r, peopleByShoot.get(r.assignments?.id ?? '') ?? []))
        .filter((a): a is Assignment => a !== null)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    );

    setAgreement({
      id: (signed.data?.id as string) ?? null,
      year,
      signed: Boolean(signed.data?.signed_on),
      signedOn: signed.data?.signed_on ? shortDate(signed.data.signed_on) : '',
    });

    setReady(true);
  }, [authStage, uid]);

  useEffect(() => {
    load();
  }, [load]);

  // FEM can change the paperwork while a freelancer has the page open, and the
  // step they were on may reopen underneath them. Refetching when the tab comes
  // back to the front is enough to stop that being a mystery, without holding a
  // realtime connection open all day.
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

  /** One step forward, and only one -- the database enforces that too, so a
      stale tab cannot skip ahead. Sending the invoice is the single step that
      also moves the money on. */
  const advance = useCallback(
    async (id: string) => {
      const current = assignments.find((a) => a.id === id);
      if (!current || current.stage >= 6) return;

      const client = requireSupabase();
      const nextStage = current.stage + 1;
      const stamp = new Date().toISOString().slice(0, 10);

      // The stage just completed is the one that gets today's date.
      const { data: existing } = await client
        .from('assignment_roles')
        .select('stage_dates')
        .eq('id', id)
        .maybeSingle();

      const dates = {
        ...((existing?.stage_dates as Record<string, string>) ?? {}),
        [String(current.stage)]: stamp,
      };

      const patch: Record<string, unknown> = { stage: nextStage, stage_dates: dates };

      if (current.stage === 1) patch.accepted_at = new Date().toISOString();

      if (current.stage === 5) {
        patch.payment_state = 'awaiting';
        patch.invoice_number = current.payment.invoiceNumber ?? invoiceNumber(id);
        patch.invoiced_on = stamp;
      }

      const { error: writeError } = await client
        .from('assignment_roles')
        .update(patch)
        .eq('id', id);

      if (writeError) {
        setError(writeError.message);
        return;
      }

      await load();
    },
    [assignments, load],
  );

  /** Records this person's signature on the job's own contract. Kept apart from
      advance() because signing and moving on are two decisions, and the second
      is refused until the first has happened. */
  const signContract = useCallback(
    async (id: string) => {
      const client = requireSupabase();

      const { data: role } = await client
        .from('assignment_roles')
        .select('assignments ( contract_path, contract_name, contract_sha256 )')
        .eq('id', id)
        .maybeSingle();

      const job = (role as {
        assignments?: {
          contract_path?: string | null;
          contract_name?: string | null;
          contract_sha256?: string | null;
        };
      } | null)?.assignments;

      const now = new Date();
      const { error: writeError } = await client
        .from('assignment_roles')
        .update({
          contract_signed_on: now.toISOString().slice(0, 10),
          contract_signed_at: now.toISOString(),
          contract_signed_sha256: job?.contract_sha256 ?? null,
          // Whatever sent them back has been dealt with.
          reopened_at: null,
          reopened_reason: null,
        })
        .eq('id', id);

      if (writeError) {
        setError(writeError.message);
        return;
      }

      try {
        await recordSignature({
          documentKind: 'job-contract',
          documentName: job?.contract_name ?? 'Contract',
          documentSha256: job?.contract_sha256 ?? null,
          documentPath: job?.contract_path ?? null,
          subjectType: 'assignment_role',
          subjectId: id,
        });
      } catch (err) {
        setError(
          `Signed, but the signing record could not be written: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        );
      }

      await load();
    },
    [load],
  );

  /** A short-lived link to the job's contract. */
  const contractUrl = useCallback(async (id: string): Promise<string> => {
    const client = requireSupabase();

    const { data: role } = await client
      .from('assignment_roles')
      .select('assignments ( contract_path )')
      .eq('id', id)
      .maybeSingle();

    const path = (role as { assignments?: { contract_path?: string } } | null)?.assignments
      ?.contract_path;
    if (!path) throw new Error('There is no contract for this job.');

    const { data, error: signError } = await client.storage
      .from('agreements')
      .createSignedUrl(path, 300);

    if (signError || !data) throw new Error(signError?.message ?? 'Could not open the contract.');
    return data.signedUrl;
  }, []);

  const signAgreement = useCallback(async () => {
    if (!uid) return;

    const client = requireSupabase();
    const year = new Date().getFullYear();

    const { data: doc } = await client
      .from('agreement_documents')
      .select('storage_path, original_name, sha256')
      .eq('year', year)
      .maybeSingle();

    const { data: row, error: writeError } = await client
      .from('agreements')
      .insert({
        freelancer_id: uid,
        year,
        signed_on: new Date().toISOString().slice(0, 10),
        signed_at: new Date().toISOString(),
        signed_sha256: doc?.sha256 ?? null,
      })
      .select('id')
      .single();

    if (writeError) {
      setError(writeError.message);
      return;
    }

    try {
      await recordSignature({
        documentKind: 'agreement',
        documentName: doc?.original_name ?? `Freelancer Agreement ${year}`,
        documentSha256: doc?.sha256 ?? null,
        documentPath: doc?.storage_path ?? null,
        subjectType: 'agreement',
        subjectId: (row as { id: string }).id,
      });
    } catch (err) {
      // The agreement is signed either way; say so rather than pretending the
      // evidence is there.
      setError(
        `Signed, but the signing record could not be written: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }

    await load();
  }, [load, uid]);

  return {
    assignments,
    agreement,
    ready,
    error,
    advance,
    signAgreement,
    signContract,
    contractUrl,
    reload: load,
  };
}
