'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import type { Craft } from './profile-types';
import { drainNotifications } from './notify';
import { sha256 as hashFile } from './signing';
import { requireSupabase, supabase } from './supabase';

/** One person wanted on a shoot. Fee and progress live here rather than on the
    shoot, because they are per person: the photographer can be paid while the
    drone operator has not delivered. */
export interface Role {
  id: string;
  assignment_id: string;
  craft: Craft;
  role_label: string;
  on_site: string | null;
  camera_ready: string | null;
  wrapped: string | null;
  due_on: string | null;
  briefing: string | null;
  expectations: string[] | null;
  shots: string[] | null;
  equipment: string[] | null;
  delivery: Partial<Delivery> | null;
  freelancer_id: string | null;
  freelancer_name: string | null;
  freelancer_avatar: string | null;
  fee_cents: number;
  status: string;
  stage: number;
  payment_state: string;
  offered_at: string | null;
  accepted_at: string | null;
  delivery_link: string | null;
  delivery_note: string | null;
  invoice_path: string | null;
  invoice_name: string | null;
}

export type JobKind = 'shoot' | 'project';

export const KIND_LABEL: Record<JobKind, string> = {
  shoot: 'Shoot',
  project: 'Project',
};

/** The job: everything the whole crew shares. A shoot has a call time and a
    venue; a project has a deadline. Forcing a web build into the shoot shape
    meant inventing an on-site time nobody would keep, and an invented 12:30
    cannot be told from a real one. */
export interface Shoot {
  id: string;
  /** FEM-2026-0001. What a job is called in a subject line. */
  reference: string | null;
  kind: JobKind;
  title: string;
  client_id: string | null;
  client_name: string | null;
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
  expectations: string[];
  shots: string[];
  equipment: string[];
  dresscode: string | null;
  client_notes: string | null;
  gallery_link: string | null;
  gallery_note: string | null;
  delivery: Delivery;
  roles: Role[];
}

export interface Delivery {
  firstSelection: string;
  fullEdit: string;
  format: string;
  retention: string;
}

export const BLANK_DELIVERY: Delivery = {
  firstSelection: '',
  fullEdit: '',
  format: '',
  retention: '',
};

export interface RoleDraft {
  craft: Craft | '';
  role_label: string;
  fee: string;
  /** Everything below is optional. Empty means this role follows the job, which
      is the case for most of them -- a producer fills in what differs. */
  on_site: string;
  camera_ready: string;
  wrapped: string;
  due_on: string;
  briefing: string;
  expectations: string;
  shots: string;
  equipment: string;
  delivery: Delivery;
}

export interface ShootDraft {
  /** Two independent facts, not a choice between two kinds of work. A launch
      with a shoot day and a website has both. */
  hasShootDay: boolean;
  hasDeadline: boolean;
  title: string;
  client_id: string;
  date: string;
  due_on: string;
  on_site: string;
  camera_ready: string;
  wrapped: string;
  city: string;
  venue: string;
  maps_url: string;
  travel: string;
  parking: string;
  briefing: string;
  /** One per line in the form, stored as an array. */
  expectations: string;
  shots: string;
  equipment: string;
  dresscode: string;
  client_notes: string;
  gallery_link: string;
  gallery_note: string;
  delivery: Delivery;
  /** Only used when creating: the crew the shoot opens with. */
  roles: RoleDraft[];
}

export const BLANK_ROLE: RoleDraft = {
  craft: '',
  role_label: '',
  fee: '',
  on_site: '',
  camera_ready: '',
  wrapped: '',
  due_on: '',
  briefing: '',
  expectations: '',
  shots: '',
  equipment: '',
  delivery: { ...BLANK_DELIVERY },
};

export const BLANK_SHOOT: ShootDraft = {
  hasShootDay: true,
  hasDeadline: false,
  title: '',
  client_id: '',
  date: '',
  due_on: '',
  on_site: '12:30',
  camera_ready: '13:00',
  wrapped: '18:00',
  city: '',
  venue: '',
  maps_url: '',
  travel: '',
  parking: '',
  briefing: '',
  expectations: '',
  shots: '',
  equipment: '',
  dresscode: '',
  client_notes: '',
  gallery_link: '',
  gallery_note: '',
  delivery: BLANK_DELIVERY,
  roles: [{ ...BLANK_ROLE }],
};

const SHOOT_COLUMNS = `
  id, reference, kind, title, client_id, starts_at, due_on, on_site, camera_ready, wrapped,
  city, venue, maps_url, travel, parking, briefing, expectations, shots,
  equipment, dresscode, client_notes, delivery, gallery_link, gallery_note,
  clients ( name ),
  assignment_roles (
    id, assignment_id, craft, role_label, freelancer_id, fee_cents,
    status, stage, payment_state, offered_at, accepted_at,
    delivery_link, delivery_note, invoice_path, invoice_name,
    on_site, camera_ready, wrapped, due_on, briefing, expectations, shots, equipment, delivery,
    profiles ( full_name, avatar_path )
  )
`;

/** Euros to cents without float drift: "450,50" and "450.50" both become 45050,
    and anything unparseable becomes zero rather than NaN. */
export function toCents(fee: string): number {
  const cleaned = fee.replace(/[^\d.,-]/g, '').replace(',', '.');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Where a job stands, as one word.
 *
 * Read off the roles rather than stored, because it is not a fact about the job
 * -- it is what its crew have between them done so far. Storing it would mean a
 * column to keep in step with six others. */
export type JobStatus =
  | 'needs-crew'
  | 'offered'
  | 'booked'
  | 'shooting'
  | 'delivered'
  | 'invoiced'
  | 'paid';

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  'needs-crew': 'Needs crew',
  offered: 'Awaiting reply',
  booked: 'Booked',
  shooting: 'In progress',
  delivered: 'Delivered',
  invoiced: 'Invoice in',
  paid: 'Paid',
};

export function jobStatus(s: Shoot): JobStatus {
  const booked = s.roles.filter((r) => r.freelancer_id);

  if (booked.length === 0 || booked.length < s.roles.length) return 'needs-crew';
  if (booked.some((r) => !r.accepted_at)) return 'offered';

  // The job is only as far along as its least advanced role: one person's
  // invoice does not make the shoot invoiced.
  const least = Math.min(...booked.map((r) => r.stage));

  if (booked.every((r) => r.payment_state === 'paid')) return 'paid';
  if (booked.every((r) => r.payment_state === 'awaiting' || r.payment_state === 'paid'))
    return 'invoiced';
  if (least >= 3) return 'delivered';
  if (least >= 2) return 'shooting';
  return 'booked';
}

/** How far through, as a fraction. Averaged across the crew, because a shoot
    with three people is two-thirds done when two of them have finished. */
export function jobProgress(s: Shoot): number {
  if (s.roles.length === 0) return 0;

  const total = s.roles.reduce((sum, r) => {
    if (!r.freelancer_id) return sum;
    return sum + (r.payment_state === 'paid' ? 6 : r.stage + 1);
  }, 0);

  return Math.round((total / (s.roles.length * 6)) * 100);
}

/** A role row, with everything left blank stored as null so it keeps following
    the job. Writing empty strings instead would freeze today's values onto the
    role and a later change to the job would stop reaching it. */
export function toRoleRow(draft: RoleDraft, assignmentId: string) {
  const some = (v: string) => (v.trim() === '' ? null : v.trim());
  const lines = (v: string) => (toLines(v).length === 0 ? null : toLines(v));
  const delivery = Object.values(draft.delivery).some((v) => v.trim() !== '')
    ? draft.delivery
    : null;

  return {
    assignment_id: assignmentId,
    craft: draft.craft,
    role_label: draft.role_label.trim() || 'Crew',
    fee_cents: toCents(draft.fee),
    on_site: some(draft.on_site),
    camera_ready: some(draft.camera_ready),
    wrapped: some(draft.wrapped),
    due_on: some(draft.due_on),
    briefing: some(draft.briefing),
    expectations: lines(draft.expectations),
    shots: lines(draft.shots),
    equipment: lines(draft.equipment),
    delivery,
  };
}

export function centsToInput(cents: number): string {
  return cents === 0 ? '' : (cents / 100).toString().replace('.', ',');
}

/** A textarea of one-per-line into an array, dropping blank lines so a stray
    return does not become an empty bullet on someone's call sheet. */
export function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

export function fromLines(lines: string[] | null): string {
  return (lines ?? []).join('\n');
}

interface RawRole {
  id: string;
  assignment_id: string;
  craft: Craft;
  role_label: string;
  on_site: string | null;
  camera_ready: string | null;
  wrapped: string | null;
  due_on: string | null;
  briefing: string | null;
  expectations: string[] | null;
  shots: string[] | null;
  equipment: string[] | null;
  delivery: Partial<Delivery> | null;
  freelancer_id: string | null;
  fee_cents: number;
  status: string;
  stage: number;
  payment_state: string;
  offered_at: string | null;
  accepted_at: string | null;
  delivery_link: string | null;
  delivery_note: string | null;
  invoice_path: string | null;
  invoice_name: string | null;
  profiles: { full_name: string | null; avatar_path: string | null } | null;
}

interface RawShoot extends Omit<Shoot, 'client_name' | 'roles' | 'delivery'> {
  clients: { name: string } | null;
  assignment_roles: RawRole[];
  delivery: Partial<Delivery> | null;
}

function flatten(row: RawShoot): Shoot {
  const { clients, assignment_roles, delivery, ...rest } = row;

  return {
    ...rest,
    client_name: clients?.name ?? null,
    delivery: { ...BLANK_DELIVERY, ...(delivery ?? {}) },
    roles: (assignment_roles ?? [])
      .map(({ profiles, ...r }) => ({
        ...r,
        freelancer_name: profiles?.full_name ?? null,
        freelancer_avatar: profiles?.avatar_path ?? null,
      }))
      // Unfilled roles first: they are the ones that still need doing.
      .sort((a, b) => Number(!!a.freelancer_id) - Number(!!b.freelancer_id)),
  };
}

function toShootRow(draft: ShootDraft, producerId: string | null) {
  const tidy = (v: string) => {
    const t = v.trim();
    return t === '' ? null : t;
  };

  const { hasShootDay, hasDeadline } = draft;

  return {
    title: draft.title.trim(),
    client_id: draft.client_id,
    producer_id: producerId,
    // Whatever comes first is what the job sorts by, so a shoot day and a
    // deadline both land in the same list in the order a producer works
    // through them.
    starts_at: hasShootDay
      ? new Date(`${draft.date}T${draft.on_site}`).toISOString()
      : new Date(`${draft.due_on}T09:00`).toISOString(),
    due_on: hasDeadline ? draft.due_on : null,
    on_site: hasShootDay ? draft.on_site : null,
    camera_ready: hasShootDay ? draft.camera_ready : null,
    wrapped: hasShootDay ? draft.wrapped : null,
    city: tidy(draft.city),
    venue: hasShootDay ? draft.venue.trim() : null,
    maps_url: tidy(draft.maps_url),
    travel: tidy(draft.travel),
    parking: tidy(draft.parking),
    briefing: tidy(draft.briefing),
    expectations: toLines(draft.expectations),
    shots: toLines(draft.shots),
    equipment: toLines(draft.equipment),
    dresscode: tidy(draft.dresscode),
    client_notes: tidy(draft.client_notes),
    gallery_link: tidy(draft.gallery_link),
    gallery_note: tidy(draft.gallery_note),
    delivery: draft.delivery,
  };
}

export function useShoots() {
  const { profile, stage } = useAuth();
  const [shoots, setShoots] = useState<Shoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || stage !== 'ready') return;
    setError(null);

    const { data, error: queryError } = await supabase
      .from('assignments')
      .select(SHOOT_COLUMNS)
      .order('starts_at', { ascending: true });

    if (queryError) {
      setError(
        queryError.message.includes('assignment_roles')
          ? 'The roles table is missing. Run migrations 0008 and 0009 in Supabase.'
          : queryError.message,
      );
    }

    setShoots(((data as unknown as RawShoot[]) ?? []).map(flatten));
    setLoading(false);
  }, [stage]);

  useEffect(() => {
    load();
  }, [load]);

  /** The shoot and its opening crew go in together. A shoot saved without roles
      would sit in Needs crew asking for nobody in particular. */
  const create = useCallback(
    async (draft: ShootDraft) => {
      const client = requireSupabase();

      const { data, error: writeError } = await client
        .from('assignments')
        .insert({ ...toShootRow(draft, profile?.id ?? null), created_by: profile?.id ?? null })
        .select('id')
        .single();

      if (writeError) throw new Error(writeError.message);
      const id = (data as { id: string }).id;

      const roles = draft.roles.filter((r) => r.craft !== '').map((r) => toRoleRow(r, id));

      if (roles.length > 0) {
        const { error: roleError } = await client.from('assignment_roles').insert(roles);
        if (roleError) {
          // A shoot nobody is wanted on is worse than no shoot: it hides in the
          // list looking finished.
          await client.from('assignments').delete().eq('id', id);
          throw new Error(roleError.message);
        }
      }

      await load();
      return id;
    },
    [load, profile?.id],
  );

  const update = useCallback(
    async (id: string, draft: ShootDraft) => {
      const { error: writeError } = await requireSupabase()
        .from('assignments')
        .update(toShootRow(draft, profile?.id ?? null))
        .eq('id', id);

      if (writeError) throw new Error(writeError.message);
      drainNotifications();
      await load();
    },
    [load, profile?.id],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error: writeError } = await requireSupabase()
        .from('assignments')
        .delete()
        .eq('id', id);
      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load],
  );

  // --- Roles ---------------------------------------------------------------

  const addRole = useCallback(
    async (assignmentId: string, draft: RoleDraft) => {
      const { error: writeError } = await requireSupabase()
        .from('assignment_roles')
        .insert(toRoleRow(draft, assignmentId));
      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load],
  );

  /** Changes what one person is asked for, without touching anyone else. */
  const updateRole = useCallback(
    async (roleId: string, assignmentId: string, draft: RoleDraft) => {
      const { assignment_id: _drop, ...fields } = toRoleRow(draft, assignmentId);
      const { error: writeError } = await requireSupabase()
        .from('assignment_roles')
        .update(fields)
        .eq('id', roleId);

      if (writeError) throw new Error(writeError.message);
      drainNotifications();
      await load();
    },
    [load],
  );

  const removeRole = useCallback(
    async (roleId: string) => {
      const { error: writeError } = await requireSupabase()
        .from('assignment_roles')
        .delete()
        .eq('id', roleId);
      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load],
  );

  /** Books someone and offers it in one step. Booking without offering leaves a
      freelancer who cannot see the shoot they are on. */
  const book = useCallback(
    async (roleId: string, freelancerId: string) => {
      const { error: writeError } = await requireSupabase()
        .from('assignment_roles')
        .update({
          freelancer_id: freelancerId,
          offered_at: new Date().toISOString(),
          status: 'action-required',
          stage: 0,
        })
        .eq('id', roleId);

      if (writeError) {
        throw new Error(
          writeError.message.includes('unique')
            ? 'They are already on this shoot.'
            : writeError.message,
        );
      }
      drainNotifications();
      await load();
    },
    [load],
  );

  const unbook = useCallback(
    async (roleId: string) => {
      const { error: writeError } = await requireSupabase()
        .from('assignment_roles')
        .update({
          freelancer_id: null,
          offered_at: null,
          accepted_at: null,
          stage: 0,
          status: 'action-required',
          // Everything the last person did goes with them. Handing the role on
          // with their invoice still attached would offer the next freelancer a
          // job that looks half paid.
          payment_state: 'not-invoiced',
          invoice_path: null,
          invoice_name: null,
          invoice_sha256: null,
          invoice_number: null,
          invoiced_on: null,
          delivery_link: null,
          delivery_note: null,
          delivered_at: null,
          stage_dates: {},
        })
        .eq('id', roleId);
      if (writeError) throw new Error(writeError.message);
      drainNotifications();
      await load();
    },
    [load],
  );

  /** Moves somebody's step for them. A producer who knows the files landed in
      the shared drive should not have to ask the freelancer to click a button
      before the job can move on -- and the ledger records who moved it. */
  const setRoleStage = useCallback(
    async (roleId: string, stage: number) => {
      const client = requireSupabase();

      const { data: existing } = await client
        .from('assignment_roles')
        .select('stage_dates')
        .eq('id', roleId)
        .maybeSingle();

      const dates = { ...((existing?.stage_dates as Record<string, string>) ?? {}) };
      const today = new Date().toISOString().slice(0, 10);

      // Walking forward stamps the steps passed; walking back clears them, so
      // the tracker never claims a day for something that was undone.
      Object.keys(dates).forEach((k) => {
        if (Number(k) >= stage) delete dates[k];
      });
      for (let i = 0; i < stage; i += 1) dates[String(i)] ??= today;

      const { error: writeError } = await client
        .from('assignment_roles')
        .update({ stage, stage_dates: dates })
        .eq('id', roleId);

      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load],
  );

  /** The last step, and the only one FEM owns outright. An RPC rather than an
      update, so the state and the date are set together and cannot disagree. */
  const confirmPayment = useCallback(
    async (roleId: string) => {
      const { error: rpcError } = await requireSupabase().rpc('confirm_payment', {
        role_id: roleId,
      });
      if (rpcError) throw new Error(rpcError.message);
      drainNotifications();
      await load();
    },
    [load],
  );

  /** Payments bounce, get sent twice, and go to the wrong account. Confirming
      one used to be final, which meant a wrong click became a database edit. */
  const undoPayment = useCallback(
    async (roleId: string, reason?: string) => {
      const { error: rpcError } = await requireSupabase().rpc('unconfirm_payment', {
        role_id: roleId,
        reason: reason ?? null,
      });
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load],
  );

  /** A short-lived link to a stored file -- an invoice, or the yearly
      agreement. The bucket is private; nothing in it is fetched directly. */
  const fileUrl = useCallback(async (path: string): Promise<string> => {
    const { data, error: signError } = await requireSupabase()
      .storage.from('agreements')
      .createSignedUrl(path, 300);

    if (signError || !data) throw new Error(signError?.message ?? 'Could not open that file.');
    return data.signedUrl;
  }, []);

  return {
    shoots,
    loading,
    error,
    reload: load,
    confirmPayment,
    undoPayment,
    setRoleStage,
    fileUrl,
    create,
    update,
    remove,
    addRole,
    updateRole,
    removeRole,
    book,
    unbook,
  };
}
