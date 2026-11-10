'use client';

import { useCallback, useEffect, useState } from 'react';
import { requireSupabase, supabase } from './supabase';
import type { CraftRow, CredentialRow, GearRow, ProfileRow } from './profile-types';

const PROFILE_COLUMNS =
  'id, role, full_name, email, phone, avatar_path, base_city, country, bio,' +
  ' travel_radius_km, travel_scope, notice_hours, company_name, coc_number, vat_number, iban';

export interface MemberProfile {
  profile: ProfileRow | null;
  crafts: CraftRow[];
  gear: GearRow[];
  credentials: CredentialRow[];
}

/** One freelancer's whole profile, read by FEM. The same four tables the
    person fills in themselves; row level security already lets staff read
    anyone's, so this is a read where the profile screen is a write.

    Loaded on demand -- when a producer opens a card -- rather than for every
    row in the team list, which would be forty queries for one answer. */
export function useMemberProfile(id: string | null) {
  const [data, setData] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    setLoading(true);
    setError(null);

    const [profile, crafts, gear, credentials] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle(),
      supabase
        .from('freelancer_crafts')
        .select('*')
        .eq('profile_id', id)
        .order('is_primary', { ascending: false }),
      supabase.from('gear').select('*').eq('profile_id', id).order('category').order('model'),
      supabase
        .from('credentials')
        .select('*')
        .eq('profile_id', id)
        .order('expires_on', { nullsFirst: false }),
    ]);

    const failure = profile.error ?? crafts.error ?? gear.error ?? credentials.error ?? null;
    if (failure) {
      setError(failure.message);
    }

    setData({
      profile: (profile.data as unknown as ProfileRow) ?? null,
      crafts: (crafts.data as CraftRow[]) ?? [],
      gear: (gear.data as GearRow[]) ?? [],
      credentials: (credentials.data as CredentialRow[]) ?? [],
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) load();
    else setData(null);
  }, [id, load]);

  return { ...(data ?? { profile: null, crafts: [], gear: [], credentials: [] }), loading, error };
}

/** A credential's document lives in the private bucket; a short-lived signed
    URL is the only way to show it, the same as a freelancer sees their own. */
export async function credentialUrl(path: string): Promise<string> {
  const { data, error } = await requireSupabase()
    .storage.from('credentials')
    .createSignedUrl(path, 120);
  if (error || !data) throw new Error(error?.message ?? 'Could not open that file.');
  return data.signedUrl;
}
