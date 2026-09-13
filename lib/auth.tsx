'use client';

import type { Factor, Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isAuthConfigured, requireSupabase, supabase } from './supabase';

export type AppRole = 'freelancer' | 'staff' | 'admin' | 'superadmin';

const VIEW_AS_KEY = 'fem.viewAs.v1';

export interface Profile {
  id: string;
  role: AppRole;
  status: 'active' | 'revoked';
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
}

interface Access extends Profile {
  mfa_required: boolean;
  mfa_enrolled: boolean;
}

/** Where the session sits in the login flow.
    - `loading`      still resolving the stored session
    - `signed-out`   no session
    - `mfa-required` signed in with one factor, but a second is demanded
    - `ready`        fully authenticated at the level this account requires */
export type AuthStage = 'loading' | 'signed-out' | 'mfa-required' | 'ready';

interface AuthValue {
  configured: boolean;
  stage: AuthStage;
  session: Session | null;
  /** The profile the screens read. Its role is the one being viewed, which for
      a superadmin trying on another role is not the one they actually hold. */
  profile: Profile | null;
  /** What the account really is. The banner and the switch read this; nothing
      else should. */
  realRole: AppRole | null;
  /** Set while a superadmin is looking at the portal as someone else. */
  viewAs: AppRole | null;
  setViewAs: (role: AppRole | null) => void;
  /** aal1 = one factor verified, aal2 = second factor verified. */
  assuranceLevel: 'aal1' | 'aal2' | null;
  /** True when this account must hold aal2 — always for staff and admins, and
      for anyone who has enrolled a factor. */
  mfaRequired: boolean;
  factors: Factor[];
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, token: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  refreshFactors: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<AuthStage>(isAuthConfigured ? 'loading' : 'ready');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [assuranceLevel, setAssuranceLevel] = useState<'aal1' | 'aal2' | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [viewAs, setViewAsState] = useState<AppRole | null>(null);

  // Survives a reload, because checking a screen usually means reloading it.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_AS_KEY) as AppRole | null;
      if (stored) setViewAsState(stored);
    } catch {
      /* no stored preference is the normal case */
    }
  }, []);

  const setViewAs = useCallback((role: AppRole | null) => {
    setViewAsState(role);
    try {
      if (role) window.localStorage.setItem(VIEW_AS_KEY, role);
      else window.localStorage.removeItem(VIEW_AS_KEY);
    } catch {
      /* the switch still applies for this session */
    }
  }, []);

  /** Re-derives everything that depends on the session: the profile, enrolled
      factors, and whether a second factor is still outstanding. */
  const sync = useCallback(async (next: Session | null) => {
    if (!supabase) return;
    setSession(next);

    if (!next) {
      setProfile(null);
      setFactors([]);
      setAssuranceLevel(null);
      setMfaRequired(false);
      setStage('signed-out');
      return;
    }

    // Deliberately my_access() and not a select on profiles. That table demands
    // aal2 from staff, so reading the role from it deadlocks the promotion it is
    // meant to describe: no second factor, no role, no way to learn one was
    // wanted. This function answers at aal1 and only ever about the caller.
    const [{ data: aal }, { data: factorData }, { data: accessRows }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
      supabase.rpc('my_access'),
    ]);

    const access = ((accessRows as Access[] | null) ?? [])[0] ?? null;
    const verified = (factorData?.all ?? []).filter((f) => f.status === 'verified');

    setFactors(verified);
    setAssuranceLevel((aal?.currentLevel as 'aal1' | 'aal2') ?? 'aal1');
    setProfile(access);

    // Supabase says a second factor is expected when nextLevel outranks
    // currentLevel. The role may demand aal2 even before one is enrolled, which
    // is the case Supabase cannot see — the same rule is enforced again in RLS,
    // so the UI is never the only gate.
    const privileged = access?.mfa_required ?? verified.length > 0;
    const outstanding = aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2';

    setMfaRequired(privileged);
    setStage(outstanding || (privileged && aal?.currentLevel !== 'aal2') ? 'mfa-required' : 'ready');
  }, []);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => sync(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      sync(next);
    });

    return () => sub.subscription.unsubscribe();
  }, [sync]);

  const sendCode = useCallback(async (email: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Accounts are created by FEM. Without this, anyone who knows the URL
        // could mint one for themselves.
        shouldCreateUser: false,
      },
    });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, token: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    if (error) throw error;
  }, []);

  const verifyMfa = useCallback(async (code: string) => {
    const client = requireSupabase();
    const { data: list, error: listError } = await client.auth.mfa.listFactors();
    if (listError) throw listError;

    const factor = (list?.totp ?? []).find((f) => f.status === 'verified');
    if (!factor) throw new Error('No authenticator app is linked to this account.');

    const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError) throw challengeError;

    const { error } = await client.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (error) throw error;

    const { data } = await client.auth.getSession();
    await sync(data.session);
  }, [sync]);

  const refreshFactors = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await sync(data.session);
  }, [sync]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const realRole = profile?.role ?? null;

  // Only a superadmin may look through someone else's screens, and only at a
  // role below their own. This changes what is rendered and nothing else: row
  // level security still sees the account that signed in, so a preview can
  // never show more than the real role could.
  const allowed = realRole === 'superadmin' && viewAs !== null && viewAs !== 'superadmin';

  const shownProfile = useMemo(
    () => (profile && allowed ? { ...profile, role: viewAs! } : profile),
    [profile, allowed, viewAs],
  );

  const value = useMemo(
    () => ({
      configured: isAuthConfigured,
      stage,
      session,
      profile: shownProfile,
      realRole,
      viewAs: allowed ? viewAs : null,
      setViewAs,
      assuranceLevel,
      mfaRequired,
      factors,
      sendCode,
      verifyCode,
      verifyMfa,
      refreshFactors,
      signOut,
    }),
    [
      stage,
      session,
      shownProfile,
      realRole,
      allowed,
      viewAs,
      setViewAs,
      assuranceLevel,
      mfaRequired,
      factors,
      sendCode,
      verifyCode,
      verifyMfa,
      refreshFactors,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('Wrap the tree in <AuthProvider>');
  return ctx;
}
