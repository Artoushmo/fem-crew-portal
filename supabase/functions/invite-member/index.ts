// Creates a portal account on behalf of a superadmin.
//
// This is the one place the service_role key is used, because creating an auth
// user needs the admin API and nothing else does. Everything that makes it safe
// happens before that key is touched:
//
//   1. The caller's own token is used to read their profile. That read is
//      subject to RLS, which for staff demands aal2 -- so a session without a
//      verified second factor cannot get past this line at all.
//   2. The row that comes back has to say 'superadmin'.
//
// Only then does the privileged client come out.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// The welcome mail is sent through Resend's API rather than Supabase's SMTP,
// for one reason: Supabase composes its own messages and offers no Reply-To
// field. Sending it here lets the envelope say noreply@ -- so nobody expects a
// conversation with a robot -- while Reply-To points at a mailbox a person
// actually reads. Without a key the invite still succeeds; the response says
// the mail was skipped rather than pretending it went out.
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'FEM Crew Portal <noreply@mail.fastelevatemedia.com>';
// Set MAIL_REPLY_TO to an empty string to drop the header entirely and let the
// mail be as one-directional as the address suggests.
const MAIL_REPLY_TO = (Deno.env.get('MAIL_REPLY_TO') ?? 'info@fastelevatemedia.com').trim();
const PORTAL_URL = (Deno.env.get('PORTAL_URL') ?? 'https://artoushmo.github.io/fem-crew-portal').replace(/\/+$/, '');

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

/** What the account is for, in the recipient's terms. A freelancer is being
    given a place to work from; the rest are being given the keys to the desk. */
function rolePitch(role: Role): string {
  return role === 'freelancer'
    ? 'Your assignments, call sheets, agreements and invoices all live here: one place, always current.'
    : 'You can create assignments, manage clients and match crew from here.';
}

function welcomeEmail(name: string, role: Role): { subject: string; html: string; text: string } {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const pitch = rolePitch(role);
  const subject = 'Your FEM Crew Portal account is ready';

  // Only promise a reply when something is listening for one.
  const contact = MAIL_REPLY_TO
    ? `Questions? Reply to this email and it reaches us at ${escapeHtml(MAIL_REPLY_TO)}.`
    : 'Fast Elevate Media &middot; This mailbox is not monitored.';
  const contactText = MAIL_REPLY_TO
    ? `Questions? Reply to this email and it reaches us at ${MAIL_REPLY_TO}.`
    : 'Fast Elevate Media - This mailbox is not monitored.';

  // Table layout and inline styles on purpose: Outlook still ignores most of
  // everything else. No images are required to read it -- the logo is a bonus,
  // not the message, because most clients block it by default.
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f6f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">

<tr><td style="background:#121111;padding:24px 32px;">
<img src="${PORTAL_URL}/logo.png" width="132" alt="Fast Elevate Media" style="display:block;border:0;height:auto;max-width:132px;">
</td></tr>

<tr><td style="padding:32px;font-family:Helvetica,Arial,sans-serif;color:#121111;">
<p style="margin:0 0 20px;font-size:20px;line-height:1.35;font-weight:600;">Your account is ready</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4a4a;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4a4a;">Fast Elevate Media has set up a FEM Crew Portal account for <strong style="color:#121111;">${escapeHtml(name || 'you')}</strong>. ${pitch}</p>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#4a4a4a;">There is no password. Enter your email address and we send you a sign-in code.</p>

<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#4c72a9;border-radius:8px;">
<a href="${PORTAL_URL}/" style="display:inline-block;padding:13px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Sign in and finish your profile</a>
</td></tr></table>

<p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#4a4a4a;">Please complete your profile before your first assignment. Your gear, certifications and invoicing details are what we match on.</p>
</td></tr>

<tr><td style="padding:20px 32px;border-top:1px solid #ececec;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8b909a;">
${contact}
</td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    greeting,
    '',
    `Fast Elevate Media has set up a FEM Crew Portal account for ${name || 'you'}. ${pitch}`,
    '',
    'There is no password. Enter your email address and we send you a sign-in code.',
    '',
    `${PORTAL_URL}/`,
    '',
    'Please complete your profile before your first assignment. Your gear, certifications and invoicing details are what we match on.',
    '',
    contactText,
  ].join('\n');

  return { subject, html, text };
}

/** Never throws: a delivered account with an undelivered mail is a smaller
    problem than an invite that reports failure after the user already exists. */
async function sendWelcome(to: string, name: string, role: Role): Promise<string> {
  if (!RESEND_KEY) return 'skipped: RESEND_API_KEY is not set on this function';

  const { subject, html, text } = welcomeEmail(name, role);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [to],
        ...(MAIL_REPLY_TO ? { reply_to: MAIL_REPLY_TO } : {}),
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) return `failed: ${res.status} ${(await res.text()).slice(0, 200)}`;
    return 'sent';
  } catch (err) {
    return `failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in.' }, 401);

  let payload: {
    action?: string;
    email?: string;
    full_name?: string;
    role?: string;
    target_id?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const action = payload.action ?? 'invite';
  if (!['invite', 'revoke', 'restore'].includes(action)) {
    return json({ error: 'Unknown action.' }, 400);
  }

  const email = (payload.email ?? '').trim().toLowerCase();
  const fullName = (payload.full_name ?? '').trim();
  const role = (payload.role ?? 'freelancer') as Role;

  if (action === 'invite') {
    if (!email || !email.includes('@')) return json({ error: 'Give a valid email address.' }, 400);
    if (!GRANTABLE.includes(role)) return json({ error: 'Unknown role.' }, 400);
  } else if (!payload.target_id) {
    return json({ error: 'Say whose access to change.' }, 400);
  }

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

  // --- Ending and restoring access -----------------------------------------

  if (action === 'revoke' || action === 'restore') {
    const targetId = payload.target_id!;

    if (targetId === profile.id) {
      return json({ error: 'You cannot end your own access.' }, 400);
    }

    const { data: target } = await admin
      .from('profiles')
      .select('id, role, status, full_name, email')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) return json({ error: 'No such member.' }, 404);

    if (action === 'revoke' && target.role === 'superadmin') {
      // Same rule as demotion: the last superadmin out means the only way back
      // in is the Supabase dashboard, which is what this whole screen avoids.
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'superadmin')
        .eq('status', 'active');

      if ((count ?? 0) <= 1) {
        return json({ error: 'That is the only superadmin left.' }, 409);
      }
    }

    const banned = action === 'revoke';

    // The ban is what actually stops a sign-in: GoTrue refuses to issue or
    // refresh a token for a banned user, so no new code gets them in.
    const { error: banError } = await admin.auth.admin.updateUserById(targetId, {
      ban_duration: banned ? '876000h' : 'none',
    });

    if (banError) return json({ error: `Could not change their sign-in: ${banError.message}` }, 500);

    const { error: statusError } = await admin
      .from('profiles')
      .update(
        banned
          ? { status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: profile.id }
          : { status: 'active', revoked_at: null, revoked_by: null },
      )
      .eq('id', targetId);

    if (statusError) {
      // Put the ban back the way it was rather than leave the two disagreeing.
      await admin.auth.admin.updateUserById(targetId, {
        ban_duration: banned ? 'none' : '876000h',
      });
      return json({ error: `Could not update their status: ${statusError.message}` }, 500);
    }

    await admin.from('access_log').insert({
      actor_id: profile.id,
      action: banned ? 'access revoked' : 'access restored',
      subject_type: 'profile',
      subject_id: targetId,
    });

    return json({
      id: targetId,
      status: banned ? 'revoked' : 'active',
      // An access token already in a browser stays signature-valid until it
      // expires. Staff reach is gone at once -- is_staff() reads the status --
      // but a revoked freelancer can still see their own rows for that long.
      note: banned ? 'They cannot sign in again. An open session ends within the hour.' : null,
    });
  }

  // --- Creating an account --------------------------------------------------

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

  const welcome = await sendWelcome(email, fullName, role);

  await admin.from('access_log').insert({
    actor_id: profile.id,
    action: `invited as ${role} (welcome mail: ${welcome})`,
    subject_type: 'profile',
    subject_id: newId,
  });

  return json({ id: newId, email, role, welcome_email: welcome }, 201);
}

// The runtime's current shape. Deliberately not using withSupabase: this needs
// two distinct clients -- the caller's, so RLS applies, and the privileged one --
// and building them by hand keeps that boundary visible.
export default { fetch: handler };
