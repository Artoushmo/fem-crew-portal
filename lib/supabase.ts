import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Supabase replaced the anon JWT with a "publishable key" (sb_publishable_…).
// Both do the same job, so accept either name.
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** With no project configured the portal runs as an unauthenticated demo on seed
    data. Production must set both variables — see README, "Authentication". */
export const isAuthConfigured = Boolean(url && anonKey);

/** The anon key is meant to be public: it identifies the project, it does not
    grant access. Every table is protected by row level security instead, which
    Postgres enforces on the server. Never ship the service_role key here — it
    bypasses RLS entirely. */
export const supabase: SupabaseClient | null = isAuthConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        // Codes are verified server-side against the email, never carried in a
        // redirect URL, so PKCE buys nothing here — and its verifier lives in
        // the localStorage of whichever browser asked for the code, which breaks
        // entering that code anywhere else.
        flowType: 'implicit',
      },
    })
  : null;

/** Narrows the client for call sites that already know auth is configured. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}
