'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import type { Craft } from './profile-types';
import { supabase } from './supabase';

export interface CrewMember {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
  base_city: string | null;
  travel_radius_km: number | null;
  crafts: Craft[];
  primary_craft: Craft | null;
  gear_count: number;
  /** Certifications that have expired or expire before the shoot. A drone job
      with a lapsed licence is the one match a producer must never make blind. */
  expiring: string[];
  /** Days this person has blocked out that overlap the shoot. */
  unavailable: boolean;
  /** Shoots already booked on the same day. Being somewhere else is the most
      common reason a match fails. */
  clash: boolean;
}

interface Row {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
  base_city: string | null;
  travel_radius_km: number | null;
  status: string;
  role: string;
  freelancer_crafts: { craft: Craft; is_primary: boolean }[];
  gear: { id: string }[];
  credentials: { title: string; expires_on: string | null }[];
  availability: { kind: string; starts_on: string; ends_on: string }[];
  assignment_roles: { offered_at: string | null; assignments: { starts_at: string } | null }[];
}

const COLUMNS = `
  id, full_name, email, avatar_path, base_city, travel_radius_km, status, role,
  freelancer_crafts ( craft, is_primary ),
  gear ( id ),
  credentials ( title, expires_on ),
  availability ( kind, starts_on, ends_on ),
  assignment_roles ( offered_at, assignments ( starts_at ) )
`;

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

/** Everyone bookable, with the handful of facts that decide a booking. The
    shoot date is passed in because half of those facts are only true relative
    to a day. */
export function useCrew(shootDate: string | null) {
  const { stage } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || stage !== 'ready') return;
    setError(null);

    const { data, error: queryError } = await supabase
      .from('profiles')
      .select(COLUMNS)
      .eq('role', 'freelancer')
      .eq('status', 'active')
      .order('full_name');

    if (queryError) setError(queryError.message);
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, [stage]);

  useEffect(() => {
    load();
  }, [load]);

  const crew = useMemo<CrewMember[]>(() => {
    const day = shootDate ? shootDate.slice(0, 10) : null;

    return rows.map((r) => {
      const crafts = (r.freelancer_crafts ?? []).map((c) => c.craft);
      const primary = (r.freelancer_crafts ?? []).find((c) => c.is_primary)?.craft ?? null;

      const expiring = day
        ? (r.credentials ?? [])
            .filter((c) => c.expires_on !== null && c.expires_on < day)
            .map((c) => c.title)
        : [];

      const unavailable = day
        ? (r.availability ?? []).some(
            (a) => a.kind === 'unavailable' && a.starts_on <= day && a.ends_on >= day,
          )
        : false;

      const clash = day
        ? (r.assignment_roles ?? []).some(
            (b) => b.offered_at !== null && b.assignments && sameDay(b.assignments.starts_at, day),
          )
        : false;

      return {
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        avatar_path: r.avatar_path,
        base_city: r.base_city,
        travel_radius_km: r.travel_radius_km,
        crafts,
        primary_craft: primary,
        gear_count: (r.gear ?? []).length,
        expiring,
        unavailable,
        clash,
      };
    });
  }, [rows, shootDate]);

  return { crew, loading, error, reload: load };
}

/** Ranks candidates for one role. Deliberately transparent: every reason is
    something the producer can see on the card, so a surprising order can always
    be explained rather than trusted. */
export function rankForCraft(crew: CrewMember[], craft: Craft, city: string | null) {
  const score = (m: CrewMember) => {
    let s = 0;
    if (m.primary_craft === craft) s += 4;
    else if (m.crafts.includes(craft)) s += 3;
    if (city && m.base_city && m.base_city.toLowerCase() === city.toLowerCase()) s += 2;
    if (m.gear_count > 0) s += 1;
    if (m.unavailable) s -= 6;
    if (m.clash) s -= 6;
    if (m.expiring.length > 0) s -= 3;
    return s;
  };

  return [...crew]
    .map((m) => ({ member: m, score: score(m), fits: m.crafts.includes(craft) }))
    .sort((a, b) => b.score - a.score || (a.member.full_name ?? '').localeCompare(b.member.full_name ?? ''));
}
