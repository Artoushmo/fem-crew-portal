'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import type { Craft } from './profile-types';
import { requireSupabase, supabase } from './supabase';

/** An assignment as FEM sees it: the row plus the two names that make it
    readable. Nothing here is what a freelancer's screen renders -- that stays on
    lib/assignments.ts until the portal side is moved over. */
export interface StaffAssignment {
  id: string;
  title: string;
  client_id: string | null;
  client_name: string | null;
  freelancer_id: string | null;
  freelancer_name: string | null;
  required_craft: Craft | null;
  role: string;
  starts_at: string;
  on_site: string;
  camera_ready: string;
  wrapped: string;
  city: string;
  venue: string;
  maps_url: string | null;
  travel: string | null;
  parking: string | null;
  fee_cents: number;
  briefing: string | null;
  dresscode: string | null;
  client_notes: string | null;
  stage: number;
  status: string;
  published_at: string | null;
}

export interface AssignmentDraft {
  title: string;
  client_id: string;
  required_craft: Craft | '';
  role: string;
  date: string;
  on_site: string;
  camera_ready: string;
  wrapped: string;
  city: string;
  venue: string;
  maps_url: string;
  travel: string;
  parking: string;
  /** Euros as typed. Converted to cents on the way in -- money is never a float
      in the database. */
  fee: string;
  briefing: string;
  dresscode: string;
  client_notes: string;
}

export const BLANK_ASSIGNMENT: AssignmentDraft = {
  title: '',
  client_id: '',
  required_craft: '',
  role: '',
  date: '',
  on_site: '12:30',
  camera_ready: '13:00',
  wrapped: '18:00',
  city: '',
  venue: '',
  maps_url: '',
  travel: '',
  parking: '',
  fee: '',
  briefing: '',
  dresscode: '',
  client_notes: '',
};

const COLUMNS = `
  id, title, client_id, freelancer_id, required_craft, role, starts_at,
  on_site, camera_ready, wrapped, city, venue, maps_url, travel, parking,
  fee_cents, briefing, dresscode, client_notes, stage, status, published_at,
  clients ( name ),
  profiles!assignments_freelancer_id_fkey ( full_name )
`;

interface JoinedRow extends Omit<StaffAssignment, 'client_name' | 'freelancer_name'> {
  clients: { name: string } | null;
  profiles: { full_name: string | null } | null;
}

function flatten(row: JoinedRow): StaffAssignment {
  const { clients, profiles, ...rest } = row;
  return {
    ...rest,
    client_name: clients?.name ?? null,
    freelancer_name: profiles?.full_name ?? null,
  };
}

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

function toRow(draft: AssignmentDraft, producerId: string | null) {
  const tidy = (v: string) => {
    const t = v.trim();
    return t === '' ? null : t;
  };

  return {
    title: draft.title.trim(),
    client_id: draft.client_id,
    producer_id: producerId,
    required_craft: draft.required_craft === '' ? null : draft.required_craft,
    role: draft.role.trim(),
    // The date and the on-site time are one moment; the database stores it as
    // one, so a shoot cannot end up on two different days.
    starts_at: new Date(`${draft.date}T${draft.on_site}`).toISOString(),
    on_site: draft.on_site,
    camera_ready: draft.camera_ready,
    wrapped: draft.wrapped,
    city: draft.city.trim(),
    venue: draft.venue.trim(),
    maps_url: tidy(draft.maps_url),
    travel: tidy(draft.travel),
    parking: tidy(draft.parking),
    fee_cents: toCents(draft.fee),
    briefing: tidy(draft.briefing),
    dresscode: tidy(draft.dresscode),
    client_notes: tidy(draft.client_notes),
  };
}

export function useStaffAssignments() {
  const { profile, stage } = useAuth();
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || stage !== 'ready') return;
    setError(null);

    const { data, error: queryError } = await supabase
      .from('assignments')
      .select(COLUMNS)
      .order('starts_at', { ascending: true });

    if (queryError) setError(queryError.message);

    setAssignments(((data as unknown as JoinedRow[]) ?? []).map(flatten));
    setLoading(false);
  }, [stage]);

  useEffect(() => {
    load();
  }, [load]);

  /** Created unassigned and unpublished. Booking crew is a separate, deliberate
      act -- an assignment that offered itself the moment it was saved would be
      out the door before anyone read it back. */
  const create = useCallback(
    async (draft: AssignmentDraft) => {
      const { data, error: writeError } = await requireSupabase()
        .from('assignments')
        .insert({ ...toRow(draft, profile?.id ?? null), created_by: profile?.id ?? null })
        .select('id')
        .single();

      if (writeError) throw new Error(writeError.message);
      await load();
      return (data as { id: string }).id;
    },
    [load, profile?.id],
  );

  const update = useCallback(
    async (id: string, draft: AssignmentDraft) => {
      const { error: writeError } = await requireSupabase()
        .from('assignments')
        .update(toRow(draft, profile?.id ?? null))
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

  return { assignments, loading, error, reload: load, create, update, remove };
}
