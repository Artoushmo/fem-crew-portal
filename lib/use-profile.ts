'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';
import type {
  CraftRow,
  CredentialRow,
  GearRow,
  ProfileRow,
} from './profile-types';

const PROFILE_COLUMNS =
  'id, role, full_name, email, phone, avatar_path, base_city, country, bio,' +
  ' travel_radius_km, notice_hours, company_name, coc_number, vat_number, iban';

export interface ProfileBundle {
  profile: ProfileRow | null;
  crafts: CraftRow[];
  gear: GearRow[];
  credentials: CredentialRow[];
}

const EMPTY: ProfileBundle = { profile: null, crafts: [], gear: [], credentials: [] };

/** Everything on the profile screen, loaded together and refetched as a unit.
    Every query filters by the signed-in id explicitly. Leaving that to RLS
    looks equivalent until someone becomes staff — then they may read everyone's
    rows, .single() gets more than one, and the Kit tab fills with other
    people's gear. RLS bounds what you may see; it does not narrow what you
    asked for. */
export function useProfileData() {
  const { session } = useAuth();
  const [data, setData] = useState<ProfileBundle>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) {
      setData(EMPTY);
      setLoading(false);
      return;
    }

    setError(null);

    const uid = session.user.id;

    const [profile, crafts, gear, credentials] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', uid).maybeSingle(),
      supabase
        .from('freelancer_crafts')
        .select('*')
        .eq('profile_id', uid)
        .order('is_primary', { ascending: false }),
      supabase.from('gear').select('*').eq('profile_id', uid).order('category').order('model'),
      supabase
        .from('credentials')
        .select('*')
        .eq('profile_id', uid)
        .order('expires_on', { nullsFirst: false }),
    ]);

    const failure =
      profile.error ?? crafts.error ?? gear.error ?? credentials.error ?? null;

    if (failure) {
      // A missing table means migration 0002 has not run yet; say so plainly
      // rather than showing an empty profile as if it were complete.
      setError(
        failure.message.includes('does not exist')
          ? 'The profile tables are missing. Run migration 0002 in Supabase.'
          : failure.message,
      );
    } else if (!profile.data) {
      // maybeSingle() returns nothing when RLS refused the row, which is what a
      // role that demands a second factor looks like from here.
      setError(
        'Your profile could not be read. If your role changed recently, link an authenticator under Security and sign in again.',
      );
    }

    setData({
      profile: (profile.data as unknown as ProfileRow) ?? null,
      crafts: (crafts.data as CraftRow[]) ?? [],
      gear: (gear.data as GearRow[]) ?? [],
      credentials: (credentials.data as CredentialRow[]) ?? [],
    });
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, error, reload: load };
}

/** Public URL for an avatar. The bucket is public and the path carries a uuid,
    so no signing round-trip is needed to render a picture. */
export function avatarUrl(path: string | null | undefined) {
  if (!path || !supabase) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
