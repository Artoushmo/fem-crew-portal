'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import type { Craft } from './profile-types';
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
  freelancer_id: string | null;
  freelancer_name: string | null;
  freelancer_avatar: string | null;
  fee_cents: number;
  status: string;
  stage: number;
  payment_state: string;
  offered_at: string | null;
  accepted_at: string | null;
  contract_signed_on: string | null;
  signed_copy_path: string | null;
  signed_copy_name: string | null;
  delivery_link: string | null;
  delivery_note: string | null;
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
  contract_path: string | null;
  contract_name: string | null;
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
}

export interface ShootDraft {
  kind: JobKind;
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
  delivery: Delivery;
  /** Only used when creating: the crew the shoot opens with. */
  roles: RoleDraft[];
}

export const BLANK_ROLE: RoleDraft = { craft: '', role_label: '', fee: '' };

export const BLANK_SHOOT: ShootDraft = {
  kind: 'shoot',
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
  delivery: BLANK_DELIVERY,
  roles: [{ ...BLANK_ROLE }],
};

const SHOOT_COLUMNS = `
  id, kind, title, client_id, starts_at, due_on, on_site, camera_ready, wrapped,
  city, venue, maps_url, travel, parking, briefing, expectations, shots,
  equipment, dresscode, client_notes, delivery, contract_path, contract_name,
  clients ( name ),
  assignment_roles (
    id, assignment_id, craft, role_label, freelancer_id, fee_cents,
    status, stage, payment_state, offered_at, accepted_at,
    contract_signed_on, signed_copy_path, signed_copy_name, delivery_link, delivery_note,
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
  freelancer_id: string | null;
  fee_cents: number;
  status: string;
  stage: number;
  payment_state: string;
  offered_at: string | null;
  accepted_at: string | null;
  contract_signed_on: string | null;
  signed_copy_path: string | null;
  signed_copy_name: string | null;
  delivery_link: string | null;
  delivery_note: string | null;
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

  const isShoot = draft.kind === 'shoot';

  return {
    kind: draft.kind,
    title: draft.title.trim(),
    client_id: draft.client_id,
    producer_id: producerId,
    // For a shoot the date and the on-site time are one moment, so it cannot
    // end up on two days. A project has no call time, so it starts at the top
    // of its deadline day and sorts alongside everything else.
    starts_at: isShoot
      ? new Date(`${draft.date}T${draft.on_site}`).toISOString()
      : new Date(`${draft.due_on}T09:00`).toISOString(),
    due_on: isShoot ? null : draft.due_on,
    on_site: isShoot ? draft.on_site : null,
    camera_ready: isShoot ? draft.camera_ready : null,
    wrapped: isShoot ? draft.wrapped : null,
    city: isShoot ? draft.city.trim() : tidy(draft.city),
    venue: isShoot ? draft.venue.trim() : null,
    maps_url: tidy(draft.maps_url),
    travel: tidy(draft.travel),
    parking: tidy(draft.parking),
    briefing: tidy(draft.briefing),
    expectations: toLines(draft.expectations),
    shots: toLines(draft.shots),
    equipment: toLines(draft.equipment),
    dresscode: tidy(draft.dresscode),
    client_notes: tidy(draft.client_notes),
    delivery: draft.delivery,
  };
}

const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;

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

      const roles = draft.roles
        .filter((r) => r.craft !== '')
        .map((r) => ({
          assignment_id: id,
          craft: r.craft,
          role_label: r.role_label.trim() || 'Crew',
          fee_cents: toCents(r.fee),
        }));

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
      const { error: writeError } = await requireSupabase().from('assignment_roles').insert({
        assignment_id: assignmentId,
        craft: draft.craft,
        role_label: draft.role_label.trim() || 'Crew',
        fee_cents: toCents(draft.fee),
      });
      if (writeError) throw new Error(writeError.message);
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
        })
        .eq('id', roleId);
      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load],
  );

  /** Attaches the client's own paperwork to a job. Stored beside the yearly
      agreement in the same private bucket, under the job's id, and reached
      through an expiring signed url like everything else in there. */
  const attachContract = useCallback(
    async (shootId: string, file: File) => {
      if (file.type !== 'application/pdf') throw new Error('The contract has to be a PDF.');
      if (file.size > MAX_CONTRACT_BYTES) throw new Error('That file is over 10 MB.');

      const digest = await hashFile(file);
      const client = requireSupabase();
      const path = `jobs/${shootId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '-')}`;

      const { error: uploadError } = await client.storage
        .from('agreements')
        .upload(path, file, { contentType: 'application/pdf' });

      if (uploadError) throw new Error(uploadError.message);

      const { error: writeError } = await client
        .from('assignments')
        .update({ contract_path: path, contract_name: file.name, contract_sha256: digest })
        .eq('id', shootId);

      if (writeError) {
        await client.storage.from('agreements').remove([path]);
        throw new Error(writeError.message);
      }

      await load();
    },
    [load],
  );

  /** Detaches it. The file stays in the bucket: someone may already have signed
      against it, and deleting the paper under a signature is not a tidy-up. */
  const removeContract = useCallback(
    async (shootId: string) => {
      const { error: writeError } = await requireSupabase()
        .from('assignments')
        .update({ contract_path: null, contract_name: null, contract_sha256: null })
        .eq('id', shootId);

      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load],
  );

  /** The last step of the whole process, and the only one FEM owns outright.
      An RPC rather than an update, so the state and the date are set together
      and can never disagree -- and so the refusal for anyone else comes from the
      database instead of a hidden button. */
  const confirmPayment = useCallback(
    async (roleId: string) => {
      const { error: rpcError } = await requireSupabase().rpc('confirm_payment', {
        role_id: roleId,
      });
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load],
  );

  const contractUrl = useCallback(async (path: string): Promise<string> => {
    const { data, error: signError } = await requireSupabase()
      .storage.from('agreements')
      .createSignedUrl(path, 300);

    if (signError || !data) throw new Error(signError?.message ?? 'Could not open the contract.');
    return data.signedUrl;
  }, []);

  return {
    shoots,
    loading,
    error,
    reload: load,
    attachContract,
    removeContract,
    confirmPayment,
    contractUrl,
    create,
    update,
    remove,
    addRole,
    removeRole,
    book,
    unbook,
  };
}
