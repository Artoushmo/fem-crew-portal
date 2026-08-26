// Creates a portal account on behalf of a superadmin.
//
// This is the one place the service_role key is used, because creating an auth
// user needs the admin API and nothing else does. Everything that makes it safe
// happens before that key is touched:
//
//   1. The caller's own token is used to read their profile. That read is
//      subject to RLS, which for staff demands aal2 — so a session without a
//      verified second factor cannot get past this line at all.
//   2. The row that comes back has to say 'superadmin'.
//
// Only then does the privileged client come out.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Set ALLOWED_ORIGIN to the portal's URL in production. '*' is fine while the
// only caller is localhost.
const ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

const GRANTABLE = ['freelancer', 'staff', 'admin', 'superadmin'] as const;
type Role = (typeof GRANTABLE)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in.' }, 401);

  let payload: { email?: string; full_name?: string; role?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const email = (payload.email ?? '').trim().toLowerCase();
  const fullName = (payload.full_name ?? '').trim();
  const role = (payload.role ?? 'freelancer') as Role;

  if (!email || !email.includes('@')) return json({ error: 'Give a valid email address.' }, 400);
  if (!GRANTABLE.includes(role)) return json({ error: 'Unknown role.' }, 400);

  // --- Step 1: who is asking, and are they allowed? -------------------------

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: caller } = await asCaller.auth.getUser();
  if (!caller?.user) return json({ error: 'Not signed in.' }, 401);

  // RLS does the heavy lifting: a staff session below aal2 reads nothing here.
  const { data: profile, error: profileError } = await asCaller
    .from('profiles')
    .select('id, role')
    .eq('id', caller.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return json(
      { error: 'Could not confirm your access. Sign in again with your authenticator.' },
      403,
    );
  }

  if (profile.role !== 'superadmin') {
    return json({ error: 'Only a superadmin can add members.' }, 403);
  }

  // --- Step 2: privileged work ---------------------------------------------

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    // Confirmed on creation: the portal signs people in with an emailed code,
    // so there is no password to set and no confirmation link to chase.
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });

  if (createError) {
    const already = createError.message.toLowerCase().includes('already');
    return json(
      { error: already ? 'That address already has an account.' : createError.message },
      already ? 409 : 400,
    );
  }

  const newId = created.user!.id;

  // The trigger on auth.users has already made the profile row; set the role
  // and make sure the name landed.
  const { error: roleError } = await admin
    .from('profiles')
    .update({ role, ...(fullName ? { full_name: fullName } : {}) })
    .eq('id', newId);

  if (roleError) {
    // Leaving a half-made account behind is worse than failing outright.
    await admin.auth.admin.deleteUser(newId);
    return json({ error: `Could not set the role: ${roleError.message}` }, 500);
  }

  await admin.from('access_log').insert({
    actor_id: profile.id,
    action: `invited as ${role}`,
    subject_type: 'profile',
    subject_id: newId,
  });

  return json({ id: newId, email, role }, 201);
}

// The runtime's current shape. Deliberately not using withSupabase: this needs
// two distinct clients — the caller's, so RLS applies, and the privileged one —
// and building them by hand keeps that boundary visible.
export default { fetch: handler };
