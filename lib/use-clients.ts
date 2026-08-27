'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { requireSupabase, supabase } from './supabase';

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
}

export type ClientDraft = Omit<Client, 'id' | 'created_at'>;

export const BLANK_CLIENT: ClientDraft = {
  name: '',
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  address: null,
  city: null,
  notes: null,
};

const COLUMNS =
  'id, name, contact_name, contact_email, contact_phone, address, city, notes, created_at';

/** Trims, and turns an emptied field back into null rather than storing an
    empty string. The difference matters on the assignment screen, which shows a
    contact only when there is one. */
function clean(draft: ClientDraft): ClientDraft {
  const tidy = (v: string | null) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };

  return {
    name: (draft.name ?? '').trim(),
    contact_name: tidy(draft.contact_name),
    contact_email: tidy(draft.contact_email)?.toLowerCase() ?? null,
    contact_phone: tidy(draft.contact_phone),
    address: tidy(draft.address),
    city: tidy(draft.city),
    notes: tidy(draft.notes),
  };
}

export function useClients() {
  const { profile, stage } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = profile ? profile.role !== 'freelancer' : false;

  const load = useCallback(async () => {
    if (!supabase || stage !== 'ready') return;
    setError(null);

    const { data, error: queryError } = await supabase
      .from('clients')
      .select(COLUMNS)
      .order('name');

    if (queryError) {
      setError(
        queryError.message.includes('does not exist')
          ? 'The clients table is missing. Run migration 0002 in Supabase.'
          : queryError.message,
      );
    }

    setClients((data as Client[]) ?? []);
    setLoading(false);
  }, [stage]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (draft: ClientDraft) => {
      const { error: writeError } = await requireSupabase()
        .from('clients')
        .insert({ ...clean(draft), created_by: profile?.id ?? null });
      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load, profile?.id],
  );

  const update = useCallback(
    async (id: string, draft: ClientDraft) => {
      const { error: writeError } = await requireSupabase()
        .from('clients')
        .update({ ...clean(draft), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load],
  );

  /** Deletes only when nothing points at the client. An assignment carries the
      client's name onto a call sheet and an invoice, so removing the record out
      from under a booked shoot would leave both wrong. */
  const remove = useCallback(
    async (id: string) => {
      const client = requireSupabase();

      const { count } = await client
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id);

      if ((count ?? 0) > 0) {
        throw new Error(
          `${count} assignment${count === 1 ? '' : 's'} still point here. Clients with history stay.`,
        );
      }

      const { error: writeError } = await client.from('clients').delete().eq('id', id);
      if (writeError) throw new Error(writeError.message);
      await load();
    },
    [load],
  );

  return { clients, loading, error, canManage, reload: load, create, update, remove };
}
