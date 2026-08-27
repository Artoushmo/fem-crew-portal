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
// Defaults to Vercel, not the GitHub Pages build. Pages is a static export: it
// only has pages for the sample assignments, so a link to a real one 404s
// before the portal gets a chance to load. A mail that lands on a dead page is
// worse than no mail.
const PORTAL_URL = (Deno.env.get('PORTAL_URL') ?? 'https://fem-crew-portal.vercel.app').replace(/\/+$/, '');

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

// Kept in step with ROLE_LABEL in lib/use-team.ts. Someone reading a mail about
// their own role should see the same words the portal uses.
const ROLE_LABEL: Record<Role, string> = {
  freelancer: 'Freelancer',
  staff: 'FEM staff',
  admin: 'Administrator',
  superadmin: 'Superadmin',
};

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

/** What changes for them, in the only terms that matter: what they now have to
    do before the portal works. Anything above freelancer is refused every read
    until a second factor is linked, so that is the whole message. */
function roleChangeNote(role: Role): string {
  return role === 'freelancer'
    ? 'You will see your own assignments, agreements and invoices, and nothing else.'
    : 'This role requires an authenticator app. Until you link one, the portal will refuse to show you anything -- so set it up the next time you sign in, under Security on your profile.';
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

function roleChangeEmail(
  name: string,
  role: Role,
): { subject: string; html: string; text: string } {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const label = ROLE_LABEL[role];
  const subject = `Your role at Fast Elevate Media is now ${label}`;
  const note = roleChangeNote(role);

  const contact = MAIL_REPLY_TO
    ? `Questions? Reply to this email and it reaches us at ${escapeHtml(MAIL_REPLY_TO)}.`
    : 'Fast Elevate Media &middot; This mailbox is not monitored.';
  const contactText = MAIL_REPLY_TO
    ? `Questions? Reply to this email and it reaches us at ${MAIL_REPLY_TO}.`
    : 'Fast Elevate Media - This mailbox is not monitored.';

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f6f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">

<tr><td style="background:#121111;padding:24px 32px;">
<img src="${PORTAL_URL}/logo.png" width="132" alt="Fast Elevate Media" style="display:block;border:0;height:auto;max-width:132px;">
</td></tr>

<tr><td style="padding:32px;font-family:Helvetica,Arial,sans-serif;color:#121111;">
<p style="margin:0 0 20px;font-size:20px;line-height:1.35;font-weight:600;">You are now ${escapeHtml(label)}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4a4a;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#4a4a4a;">${escapeHtml(note)}</p>

<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#4c72a9;border-radius:8px;">
<a href="${PORTAL_URL}/" style="display:inline-block;padding:13px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Open the portal</a>
</td></tr></table>
</td></tr>

<tr><td style="padding:20px 32px;border-top:1px solid #ececec;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8b909a;">
${contact}
</td></tr>

</table></td></tr></table></body></html>`;

  const text = [greeting, '', note, '', `${PORTAL_URL}/`, '', contactText].join('\n');

  return { subject, html, text };
}

/** Never throws: a delivered account with an undelivered mail is a smaller
    problem than an invite that reports failure after the user already exists. */
async function sendMail(
  to: string,
  mail: { subject: string; html: string; text: string },
): Promise<string> {
  if (!RESEND_KEY) return 'skipped: RESEND_API_KEY is not set on this function';

  const { subject, html, text } = mail;

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

interface Job {
  role_id?: string;
  title?: string;
  client?: string;
  role_label?: string;
  starts_at?: string;
  due_on?: string | null;
  on_site?: string | null;
  wrapped?: string | null;
  city?: string | null;
  venue?: string | null;
  fee_cents?: number;
  freelancer?: string | null;
  reason?: string;
  changed?: string;
  link?: string | null;
  invoice?: string | null;
  returned_copy?: boolean;
}

function euro(cents: number | undefined): string {
  if (cents === undefined) return '';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function whenLine(job: Job): string {
  const parts: string[] = [];

  if (job.starts_at && job.on_site) {
    const d = new Date(job.starts_at).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    parts.push(
      `${d}, ${job.on_site.slice(0, 5)}${job.wrapped ? `-${job.wrapped.slice(0, 5)}` : ''}`,
    );
  }

  if (job.due_on) {
    parts.push(
      `Deadline ${new Date(job.due_on).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`,
    );
  }

  const place = [job.venue, job.city].filter(Boolean).join(', ');
  if (place) parts.push(place);

  return parts.join(' &middot; ');
}

/** What each kind of message says. One place, so the tone stays the same and a
    new kind cannot quietly ship without wording. */
function compose(kind: string, job: Job): { subject: string; heading: string; body: string; cta: string } | null {
  const name = job.title ?? 'an assignment';
  const client = job.client ? ` for ${job.client}` : '';

  switch (kind) {
    case 'booked':
      return {
        subject: `You have been booked: ${name}`,
        heading: 'You have been booked',
        body: `Fast Elevate Media has put you down as ${job.role_label ?? 'crew'} on <strong>${name}</strong>${client}, at ${euro(job.fee_cents)}. Open it to read the briefing and accept.`,
        cta: 'View and accept',
      };
    case 'unbooked':
      return {
        subject: `No longer needed: ${name}`,
        heading: 'This one is off',
        body: `You are no longer booked on <strong>${name}</strong>${client}. If you had kept the day free, it is yours again.`,
        cta: 'Open the portal',
      };
    case 'contract-changed':
      return {
        subject: `New contract to sign: ${name}`,
        heading: 'The paperwork changed',
        body: `${job.reason ?? 'The contract for this job was replaced.'} Until it is signed, the job cannot move on.`,
        cta: 'Read and sign',
      };
    case 'job-changed':
      return {
        subject: `Changed: ${name}`,
        heading: 'Something changed on this job',
        body: `Fast Elevate Media changed ${job.changed ?? 'the details'} on <strong>${name}</strong>${client}. Check it before the day.`,
        cta: 'See what changed',
      };
    case 'paid':
      return {
        subject: `Paid: ${name}`,
        heading: 'Your invoice is paid',
        body: `Fast Elevate Media has confirmed payment of ${euro(job.fee_cents)} for <strong>${name}</strong>${client}.`,
        cta: 'Open the portal',
      };
    case 'accepted':
      return {
        subject: `Accepted: ${name}`,
        heading: `${job.freelancer ?? 'Your crew'} accepted`,
        body: `${job.freelancer ?? 'They'} accepted ${job.role_label ? `the ${job.role_label.toLowerCase()} role` : 'the role'} on <strong>${name}</strong>${client}. You can stop looking.`,
        cta: 'Open the assignment',
      };
    case 'contract-signed':
      return {
        subject: `Signed: ${name}`,
        heading: `${job.freelancer ?? 'Your crew'} signed`,
        body: job.returned_copy
          ? `${job.freelancer ?? 'They'} returned a signed copy for <strong>${name}</strong>${client}. It is on the role, ready to file.`
          : `${job.freelancer ?? 'They'} signed the paperwork for <strong>${name}</strong>${client}.`,
        cta: 'Open the assignment',
      };
    case 'delivered':
      return {
        subject: `Delivered: ${name}`,
        heading: `${job.freelancer ?? 'Your crew'} delivered`,
        body: `The work for <strong>${name}</strong>${client} has been handed over.${job.link ? ` It is at <a href="${job.link}">${job.link}</a>.` : ''}`,
        cta: 'Open the assignment',
      };
    case 'invoiced':
      return {
        subject: `Invoice in: ${name}`,
        heading: 'An invoice is waiting',
        body: `${job.freelancer ?? 'Your crew'} invoiced ${euro(job.fee_cents)} for <strong>${name}</strong>${client}${job.invoice ? `, reference ${job.invoice}` : ''}. Mark it paid once it has gone out.`,
        cta: 'Open the assignment',
      };
    default:
      return null;
  }
}

function notificationEmail(
  kind: string,
  job: Job,
): { subject: string; html: string; text: string } | null {
  const copy = compose(kind, job);
  if (!copy) return null;

  const when = whenLine(job);
  const link = job.role_id ? `${PORTAL_URL}/assignments/${job.role_id}` : `${PORTAL_URL}/`;

  const contact = MAIL_REPLY_TO
    ? `Questions? Reply to this email and it reaches us at ${escapeHtml(MAIL_REPLY_TO)}.`
    : 'Fast Elevate Media &middot; This mailbox is not monitored.';

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f6f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">

<tr><td style="background:#121111;padding:24px 32px;">
<img src="${PORTAL_URL}/logo.png" width="132" alt="Fast Elevate Media" style="display:block;border:0;height:auto;max-width:132px;">
</td></tr>

<tr><td style="padding:32px;font-family:Helvetica,Arial,sans-serif;color:#121111;">
<p style="margin:0 0 18px;font-size:20px;line-height:1.35;font-weight:600;">${escapeHtml(copy.heading)}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4a4a;">${copy.body}</p>
${when ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#121111;font-weight:600;">${when}</p>` : ''}

<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#4c72a9;border-radius:8px;">
<a href="${link}" style="display:inline-block;padding:13px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(copy.cta)}</a>
</td></tr></table>
</td></tr>

<tr><td style="padding:20px 32px;border-top:1px solid #ececec;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8b909a;">
${contact}
</td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    copy.heading,
    '',
    copy.body.replace(/<[^>]+>/g, ''),
    when ? when.replace(/&middot;/g, '-') : '',
    '',
    link,
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { subject: copy.subject, html, text };
}

/** Sends whatever is waiting. Called by the portal rather than a scheduler, so
    a message goes out within seconds of the change that caused it -- and any
    later call picks up whatever an interrupted one left behind.

    Marked sent before the attempt would risk losing messages; marked after
    risks sending twice. Sending twice is the better failure for a booking
    notice, so the row is only cleared once Resend has accepted it. */
async function drainNotifications(): Promise<Response> {
  if (!RESEND_KEY) return json({ sent: 0, skipped: 'RESEND_API_KEY is not set' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pending, error } = await admin
    .from('notifications')
    .select('id, recipient_email, kind, payload, attempts')
    .is('sent_at', null)
    .lt('attempts', 5)
    .order('created_at')
    .limit(25);

  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;

  for (const row of pending ?? []) {
    const mail = notificationEmail(row.kind as string, (row.payload ?? {}) as Job);

    if (!mail) {
      // An unknown kind is a bug, not a retry. Park it so the queue keeps
      // moving and the row stays visible.
      await admin
        .from('notifications')
        .update({ attempts: 5, last_error: `No wording for "${row.kind}"` })
        .eq('id', row.id);
      continue;
    }

    const result = await sendMail(row.recipient_email as string, mail);

    if (result === 'sent') {
      await admin
        .from('notifications')
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id);
      sent += 1;
    } else {
      await admin
        .from('notifications')
        .update({ attempts: (row.attempts as number) + 1, last_error: result })
        .eq('id', row.id);
      failed += 1;
    }
  }

  return json({ sent, failed, pending: (pending ?? []).length });
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
  if (!['invite', 'revoke', 'restore', 'set-role', 'notify'].includes(action)) {
    return json({ error: 'Unknown action.' }, 400);
  }

  const email = (payload.email ?? '').trim().toLowerCase();
  const fullName = (payload.full_name ?? '').trim();
  const role = (payload.role ?? 'freelancer') as Role;

  // Draining the queue is not a privileged act -- it sends messages the database
  // already decided to send, to addresses it already chose. Any signed-in
  // account may kick it, which is what lets the portal drain it on load without
  // anyone waiting for a scheduler.
  if (action === 'notify') {
    return await drainNotifications();
  }

  if (action === 'invite') {
    if (!email || !email.includes('@')) return json({ error: 'Give a valid email address.' }, 400);
    if (!GRANTABLE.includes(role)) return json({ error: 'Unknown role.' }, 400);
  } else if (action === 'set-role' && !GRANTABLE.includes(role)) {
    return json({ error: 'Unknown role.' }, 400);
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

  // --- Changing a role ------------------------------------------------------

  if (action === 'set-role') {
    const targetId = payload.target_id!;

    // Through the caller's own client on purpose: every rule about roles lives
    // in set_member_role, and routing around it here would mean two places
    // deciding who may be promoted. This function only adds the email.
    const { error: rpcError } = await asCaller.rpc('set_member_role', {
      target_id: targetId,
      new_role: role,
    });

    if (rpcError) return json({ error: rpcError.message }, 400);

    const { data: target } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', targetId)
      .maybeSingle();

    const notified = target?.email
      ? await sendMail(target.email, roleChangeEmail(target.full_name ?? '', role))
      : 'skipped: no address on file';

    await admin.from('access_log').insert({
      actor_id: profile.id,
      action: `role set to ${role} (mail: ${notified})`,
      subject_type: 'profile',
      subject_id: targetId,
    });

    return json({ id: targetId, role, notified });
  }

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

  const welcome = await sendMail(email, welcomeEmail(fullName, role));

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
