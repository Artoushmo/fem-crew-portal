'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, type AppRole } from './auth';
import { supabase, requireSupabase } from './supabase';

export interface Member {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  avatar_path: string | null;
  base_city: string | null;
  status: 'active' | 'revoked';
  revoked_at: string | null;
  mfa_enrolled: boolean;
  last_sign_in: string | null;
  invited_at: string | null;
  accepted: boolean;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  freelancer: 'Freelancer',
  staff: 'FEM staff',
  admin: 'Administrator',
  superadmin: 'Superadmin',
};

export const ROLE_NOTE: Record<AppRole, string> = {
  freelancer: 'Sees only their own assignments.',
  staff: 'Creates assignments and manages clients.',
  admin: 'Everything staff can do, across the whole account.',
  superadmin: 'Also adds members and sets roles.',
};

export const ROLES = Object.keys(ROLE_LABEL) as AppRole[];

/** Pulls whatever the Edge Function put in the body, so the person sees the
    reason rather than "Edge Function returned a non-2xx status code". */
async function readFunctionError(err: unknown): Promise<string> {
  const context = (err as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) return body.error as string;
    } catch {
      /* fall through to the generic message */
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function useTeam() {
  const { profile, stage } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = profile?.role === 'superadmin';

  const load = useCallback(async () => {
    if (!supabase || stage !== 'ready') return;
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('list_members');

    if (rpcError) {
      setError(
        rpcError.message.includes('does not exist') || rpcError.message.includes('status')
          ? 'The team functions are out of date. Run migration 0006 in Supabase.'
          : rpcError.message,
      );
    }

    setMembers((data as Member[]) ?? []);
    setLoading(false);
  }, [stage]);

  useEffect(() => {
    load();
  }, [load]);

  /** Creates the account. Only the Edge Function may do this: it needs the
      service_role key, which never reaches the browser.

      Returns whether the welcome mail actually went out. The account exists
      either way, so this is not an error — but the person who pressed the
      button is the only one who can chase it, and they can only do that if we
      say so instead of showing a flat "Invited". */
  const invite = useCallback(
    async (input: { email: string; full_name: string; role: AppRole }): Promise<{ mailed: boolean; mailNote: string | null }> => {
      const { data, error: fnError } = await requireSupabase().functions.invoke('invite-member', {
        body: input,
      });
      if (fnError) throw new Error(await readFunctionError(fnError));
      await load();

      const status = (data as { welcome_email?: string } | null)?.welcome_email ?? 'sent';
      if (status === 'sent') return { mailed: true, mailNote: null };

      return {
        mailed: false,
        mailNote: status.startsWith('skipped')
          ? 'No welcome email was sent: the mail key is missing on the invite-member function. Send them the portal link yourself.'
          : `The account exists, but the welcome email did not send (${status.replace(/^failed:\s*/, '')}). Send them the portal link yourself.`,
      };
    },
    [load],
  );

  /** Goes through the Edge Function so the person is told. A role change is not
      a quiet bookkeeping edit: anything above freelancer makes the database
      refuse every read until they link an authenticator, so someone promoted
      without warning just finds a portal that stopped working. */
  const setRole = useCallback(
    async (targetId: string, role: AppRole): Promise<string | null> => {
      const { data, error: fnError } = await requireSupabase().functions.invoke('invite-member', {
        body: { action: 'set-role', target_id: targetId, role },
      });
      if (fnError) throw new Error(await readFunctionError(fnError));
      await load();

      const notified = (data as { notified?: string } | null)?.notified ?? 'sent';
      return notified === 'sent'
        ? 'Role updated. They have been emailed about the change.'
        : 'Role updated, but no email went out. Tell them yourself.';
    },
    [load],
  );

  /** Ends or restores access. This has to go through the Edge Function rather
      than an RPC: the database can mark the profile, but only the admin API can
      ban the auth user, and a status that says revoked over an account that
      still signs in is worse than no button at all. */
  const setAccess = useCallback(
    async (targetId: string, action: 'revoke' | 'restore'): Promise<string | null> => {
      const { data, error: fnError } = await requireSupabase().functions.invoke('invite-member', {
        body: { action, target_id: targetId },
      });
      if (fnError) throw new Error(await readFunctionError(fnError));
      await load();
      return (data as { note?: string | null } | null)?.note ?? null;
    },
    [load],
  );

  return { members, loading, error, canManage, reload: load, invite, setRole, setAccess };
}
