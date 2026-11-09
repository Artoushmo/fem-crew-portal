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
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';

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

// Set ALLOWED_ORIGIN to the portal's URL in production. Several, comma
// separated, while a domain is being moved: the old address keeps working
// until the last bookmark has caught up. '*' only while the sole caller is
// localhost.
const ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

/** The one origin the browser is told it may use: the caller's, if it is on
    the list, else the first on the list -- which the browser then rejects,
    which is the point. */
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED.includes('*') ? '*' : ALLOWED.includes(origin) ? origin : ALLOWED[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// Set per request in handler(); json() and the PDF response read it from here.
let cors: Record<string, string> = corsFor(new Request('https://localhost'));

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
interface Attachment {
  filename: string;
  /** Base64. Resend takes the bytes inline; nothing is hosted. */
  content: string;
}

async function sendMail(
  to: string,
  mail: { subject: string; html: string; text: string },
  attachments: Attachment[] = [],
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
        ...(attachments.length > 0 ? { attachments } : {}),
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
  is_lead?: boolean;
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
  days?: { day: string; on_site?: string | null; wrapped?: string | null; note?: string | null }[];
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

  // Several days: each on its own, with its hours. One day reads as before.
  if (job.days && job.days.length > 1) {
    for (const d of job.days) {
      const label = new Date(`${d.day}T12:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      const hours = d.on_site ? ` ${d.on_site.slice(0, 5)}${d.wrapped ? `\u2013${d.wrapped.slice(0, 5)}` : ''}` : '';
      parts.push(`${label}${hours}`);
    }
  } else if (job.starts_at && job.on_site) {
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

  return parts.map((p) => escapeHtml(p)).join(' &middot; ');
}

/** What each kind of message says. One place, so the tone stays the same and a
    new kind cannot quietly ship without wording. */
/** Only an https URL is worth turning into a link. Anything else -- a
    javascript: scheme pasted by someone who should not be able to, a bare
    path -- is shown as text and goes nowhere. */
function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function compose(kind: string, raw: Job): { subject: string; heading: string; body: string; cta: string } | null {
  // Everything here was typed by somebody and ends up in HTML. The body is
  // built with markup of our own, so the values are escaped first and the
  // markup added after; the subject stays plain text.
  const e = (v: string | null | undefined) => (v == null ? v : escapeHtml(v));
  const job: Job = {
    ...raw,
    title: e(raw.title) ?? undefined,
    client: e(raw.client) ?? undefined,
    role_label: e(raw.role_label) ?? undefined,
    changed: e(raw.changed) ?? undefined,
    invoice: e(raw.invoice),
    freelancer: e(raw.freelancer),
    reason: e(raw.reason) ?? undefined,
    link: safeHref(raw.link),
  };
  const name = job.title ?? 'an assignment';
  const client = job.client ? ` for ${job.client}` : '';

  switch (kind) {
    case 'booked':
      return {
        subject: `You have been booked: ${raw.title ?? 'an assignment'}`,
        heading: 'You have been booked',
        body: `Fast Elevate Media has put you down as ${job.is_lead ? '<strong>lead</strong> and ' : ''}${job.role_label ?? 'crew'} on <strong>${name}</strong>${client}, at ${euro(job.fee_cents)}.${job.is_lead ? ' As lead you hold the overview on site and are the point of contact for the client and the crew.' : ''} Open it to read the briefing and accept.`,
        cta: 'View and accept',
      };
    case 'unbooked':
      return {
        subject: `No longer needed: ${raw.title ?? 'an assignment'}`,
        heading: 'This one is off',
        body: `You are no longer booked on <strong>${name}</strong>${client}. If you had kept the day free, it is yours again.`,
        cta: 'Open the portal',
      };
    case 'contract-changed':
      return {
        subject: `New contract to sign: ${raw.title ?? 'an assignment'}`,
        heading: 'The paperwork changed',
        body: `${job.reason ?? 'The contract for this job was replaced.'} Until it is signed, the job cannot move on.`,
        cta: 'Read and sign',
      };
    case 'job-changed':
      return {
        subject: `Changed: ${raw.title ?? 'an assignment'}`,
        heading: 'Something changed on this job',
        body: `Fast Elevate Media changed ${job.changed ?? 'the details'} on <strong>${name}</strong>${client}. Check it before the day.`,
        cta: 'See what changed',
      };
    case 'paid':
      return {
        subject: `Paid: ${raw.title ?? 'an assignment'}`,
        heading: 'Your invoice is paid',
        body: `Fast Elevate Media has confirmed payment of ${euro(job.fee_cents)} for <strong>${name}</strong>${client}.`,
        cta: 'Open the portal',
      };
    case 'accepted':
      return {
        subject: `Accepted: ${raw.title ?? 'an assignment'}`,
        heading: `${job.freelancer ?? 'Your crew'} accepted`,
        body: `${job.freelancer ?? 'They'} accepted ${job.role_label ? `the ${job.role_label.toLowerCase()} role` : 'the role'} on <strong>${name}</strong>${client}. You can stop looking.`,
        cta: 'Open the assignment',
      };
    case 'contract-signed':
      return {
        subject: `Signed: ${raw.title ?? 'an assignment'}`,
        heading: `${job.freelancer ?? 'Your crew'} signed`,
        body: job.returned_copy
          ? `${job.freelancer ?? 'They'} returned a signed copy for <strong>${name}</strong>${client}. It is on the role, ready to file.`
          : `${job.freelancer ?? 'They'} signed the paperwork for <strong>${name}</strong>${client}.`,
        cta: 'Open the assignment',
      };
    case 'delivered':
      return {
        subject: `Delivered: ${raw.title ?? 'an assignment'}`,
        heading: `${job.freelancer ?? 'Your crew'} delivered`,
        body: `The work for <strong>${name}</strong>${client} has been handed over.${job.link ? ` It is at <a href="${job.link}">${job.link}</a>.` : ''}`,
        cta: 'Open the assignment',
      };
    case 'invoiced':
      return {
        subject: `Invoice in: ${raw.title ?? 'an assignment'}`,
        heading: 'An invoice is waiting',
        body: `${job.freelancer ?? 'Your crew'} invoiced ${euro(job.fee_cents)} for <strong>${name}</strong>${client}${job.invoice ? `, reference ${job.invoice}` : ''}. Mark it paid once it has gone out.`,
        cta: 'Open the assignment',
      };
    case 'invoice-due':
      return {
        subject: `Invoice still open: ${raw.title ?? 'an assignment'}`,
        heading: 'We are waiting on your invoice',
        body: `The work on <strong>${name}</strong>${client} is delivered, but your invoice for ${euro(job.fee_cents)} has not come in. Send it through the portal and it goes into the next payment run.`,
        cta: 'Send your invoice',
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
<p style="margin:0 0 18px;font-size:20px;line-height:1.35;font-weight:600;">${copy.heading}</p>
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

  const plain = (h: string) =>
    h
      .replace(/<[^>]+>/g, '')
      .replace(/&middot;/g, '-')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');

  const text = [plain(copy.heading), '', plain(copy.body), when ? plain(when) : '', '', link]
    .filter((l) => l !== '')
    .join('\n');

  return { subject: copy.subject, html, text };
}

// ---------------------------------------------------------------------------
// The briefing as a file
// ---------------------------------------------------------------------------
//
// A venue basement has no signal. The briefing goes with the booking as a PDF
// so that what somebody reads on the train is still in their pocket on the
// day -- and is also what they can fetch from the job page later. One page
// builder, both uses.

interface BriefingTeam {
  name: string;
  role: string;
  on_site: string | null;
  wrapped: string | null;
  /** Per date, "07:00-21:00" or null when not on that day. Only filled on a
      job with more than one day. */
  days: Record<string, string | null>;
  is_lead: boolean;
  is_you: boolean;
  phone: string | null;
}

interface BriefingDay {
  day: string;
  on_site: string | null;
  camera_ready: string | null;
  wrapped: string | null;
  note: string | null;
}

interface Briefing {
  reference: string | null;
  title: string;
  client: string;
  starts_at: string;
  due_on: string | null;
  on_site: string | null;
  camera_ready: string | null;
  wrapped: string | null;
  /** This person's days, in order, hours resolved. Empty for a deadline. */
  days: BriefingDay[];
  city: string | null;
  venue: string | null;
  maps_url: string | null;
  travel: string | null;
  parking: string | null;
  briefing: string | null;
  expectations: string[];
  shots: string[];
  equipment: string[];
  dresscode: string | null;
  delivery: Record<string, string>;
  gallery_link: string | null;
  gallery_note: string | null;
  reference_link: string | null;
  role_label: string;
  fee_cents: number;
  is_lead: boolean;
  freelancer: string;
  team: BriefingTeam[];
  producer: { name: string; phone: string | null; email: string | null } | null;
  /** Lead only. Null for everyone else, and the PDF says nothing about it. */
  client_contact: { name: string; company: string; phone: string | null; email: string | null } | null;
}

/** Everything the PDF says, for one person on one job. Role values win over
    the job's, the way the portal shows them; what the lead may see and the
    others may not is decided here, not in the layout. */
async function briefingData(admin: SupabaseClient, roleId: string): Promise<Briefing | null> {
  const { data: r } = await admin
    .from('assignment_roles')
    .select(
      `id, role_label, fee_cents, is_lead, freelancer_id,
       on_site, camera_ready, wrapped, due_on, briefing, expectations, shots, equipment, delivery,
       profiles ( full_name ),
       assignments (
         id, reference, title, starts_at, due_on, on_site, camera_ready, wrapped,
         city, venue, maps_url, travel, parking, briefing, expectations, shots, equipment,
         dresscode, delivery, gallery_link, gallery_note, producer_id,
         clients ( name, contact_name, contact_phone, contact_email ),
         assignment_days ( id, day, on_site, camera_ready, wrapped, note )
       ),
       assignment_role_days ( day_id, present, on_site, wrapped )`,
    )
    .eq('id', roleId)
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const row = r as any;
  if (!row?.assignments) return null;
  const a = row.assignments;

  const { data: mates } = await admin
    .from('assignment_roles')
    .select(
      'id, role_label, is_lead, on_site, wrapped, freelancer_id, profiles ( full_name, phone ), assignment_role_days ( day_id, present, on_site, wrapped )',
    )
    .eq('assignment_id', a.id)
    .not('freelancer_id', 'is', null)
    .not('offered_at', 'is', null);

  let producer: Briefing['producer'] = null;
  if (a.producer_id) {
    const { data: p } = await admin
      .from('profiles')
      .select('full_name, phone, email')
      .eq('id', a.producer_id)
      .maybeSingle();
    if (p) producer = { name: p.full_name ?? 'Fast Elevate Media', phone: p.phone, email: p.email };
  }

  const lead = Boolean(row.is_lead);

  // deno-lint-ignore no-explicit-any
  const jobDays: any[] = [...(a.assignment_days ?? [])].sort((x, y) => x.day.localeCompare(y.day));
  const multi = jobDays.length > 1;
  const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

  // A person's hours on a day: theirs for the day, theirs for the job, the
  // day's, the job's. Null when the day is marked not theirs.
  // deno-lint-ignore no-explicit-any
  const hoursOn = (role: any, d: any): { on: string | null; off: string | null } | null => {
    // deno-lint-ignore no-explicit-any
    const own = (role.assignment_role_days ?? []).find((x: any) => x.day_id === d.id);
    if (own && own.present === false) return null;
    return {
      on: own?.on_site ?? role.on_site ?? d.on_site ?? a.on_site ?? null,
      off: own?.wrapped ?? role.wrapped ?? d.wrapped ?? a.wrapped ?? null,
    };
  };

  const myDays: BriefingDay[] = jobDays.flatMap((d) => {
    const h = hoursOn(row, d);
    if (!h) return [];
    return [{
      day: d.day,
      on_site: h.on,
      camera_ready: row.camera_ready ?? d.camera_ready ?? a.camera_ready ?? null,
      wrapped: h.off,
      note: d.note ?? null,
    }];
  });

  return {
    reference: a.reference,
    title: a.title,
    client: a.clients?.name ?? 'Fast Elevate Media',
    starts_at: a.starts_at,
    due_on: row.due_on ?? a.due_on,
    on_site: myDays[0]?.on_site ?? row.on_site ?? a.on_site,
    camera_ready: myDays[0]?.camera_ready ?? row.camera_ready ?? a.camera_ready,
    wrapped: myDays[0]?.wrapped ?? row.wrapped ?? a.wrapped,
    days: myDays,
    city: a.city,
    venue: a.venue,
    maps_url: a.maps_url,
    travel: a.travel,
    parking: a.parking,
    briefing: row.briefing ?? a.briefing,
    expectations: row.expectations ?? a.expectations ?? [],
    shots: row.shots ?? a.shots ?? [],
    equipment: row.equipment ?? a.equipment ?? [],
    dresscode: a.dresscode,
    delivery: { ...(a.delivery ?? {}), ...(row.delivery ?? {}) },
    gallery_link: a.gallery_link,
    gallery_note: a.gallery_note,
    // Kept in the job's delivery terms; a role never has its own.
    reference_link: a.delivery?.reference ?? null,
    role_label: row.role_label,
    fee_cents: row.fee_cents,
    is_lead: lead,
    freelancer: row.profiles?.full_name ?? '',
    // deno-lint-ignore no-explicit-any
    team: ((mates ?? []) as any[])
      .map((m) => ({
        name: m.profiles?.full_name ?? 'Crew',
        role: m.role_label,
        on_site: m.on_site ?? a.on_site,
        wrapped: m.wrapped ?? a.wrapped,
        days: multi
          ? Object.fromEntries(
              jobDays.map((d) => {
                const h = hoursOn(m, d);
                return [d.day, h && h.on && h.off ? `${hm(h.on)}\u2013${hm(h.off)}` : null];
              }),
            )
          : {},
        is_lead: Boolean(m.is_lead),
        is_you: m.id === row.id,
        // Numbers are the lead's to have. Nobody else gets them, in the PDF
        // any more than on the page.
        phone: lead && m.id !== row.id ? (m.profiles?.phone ?? null) : null,
      }))
      .sort(
        (x, y) =>
          Number(y.is_you) - Number(x.is_you) ||
          Number(y.is_lead) - Number(x.is_lead) ||
          (x.on_site ?? '').localeCompare(y.on_site ?? ''),
      ),
    producer,
    client_contact:
      lead && a.clients?.contact_name
        ? {
            name: a.clients.contact_name,
            company: a.clients.name,
            phone: a.clients.contact_phone,
            email: a.clients.contact_email,
          }
        : null,
  };
}

/** Standard fonts speak WinAnsi and nothing else. Anything outside it -- an
    emoji in a briefing, say -- would throw mid-page, so it is dropped here. */
function winAnsi(text: string): string {
  return text.replace(/[^\n\r\t -~\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/g, '');
}

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function shortDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The briefing, laid out like a call sheet: what matters on the day at the
    top, the rest in reading order, the team at the end. A4, one column, so it
    reads the same on a phone screen as on paper. */
async function briefingPdf(b: Briefing): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Briefing - ${b.title}`);
  doc.setAuthor('Fast Elevate Media');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const res = await fetch(`${PORTAL_URL}/logo.png`);
    if (res.ok) logo = await doc.embedPng(await res.arrayBuffer());
  } catch {
    // No logo is a plainer page, not a failed one.
  }

  const ink = rgb(0.07, 0.067, 0.067);
  const muted = rgb(0.545, 0.565, 0.604);
  const secondary = rgb(0.29, 0.29, 0.29);
  const blue = rgb(0.298, 0.447, 0.663);
  const panel = rgb(0.965, 0.961, 0.961);
  const gold = rgb(0.949, 0.745, 0.314);
  const line = rgb(0.925, 0.925, 0.925);

  const W = 595.28;
  const H = 841.89;
  const M = 46;
  const COL = W - 2 * M;

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
  };

  const ensure = (h: number) => {
    if (y - h < M + 28) newPage();
  };

  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const out: string[] = [];
    for (const para of winAnsi(text).split(/\r?\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        out.push('');
        continue;
      }
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) <= width) {
          cur = next;
        } else {
          if (cur) out.push(cur);
          cur = w;
        }
      }
      if (cur) out.push(cur);
    }
    return out;
  };

  const text = (
    str: string,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? regular;
    const x = opts.x ?? M;
    const width = opts.width ?? COL;
    const lh = size * 1.45;
    const lines = wrap(str, font, size, width);
    for (const l of lines) {
      ensure(lh);
      page.drawText(l, { x, y: y - size, size, font, color: opts.color ?? ink });
      y -= lh;
    }
    y -= opts.gap ?? 0;
  };

  const eyebrow = (str: string) => {
    ensure(26);
    y -= 6;
    page.drawText(winAnsi(str).toUpperCase(), {
      x: M,
      y: y - 8,
      size: 8,
      font: bold,
      color: muted,
      characterSpacing: 1.2,
    } as Parameters<PDFPage['drawText']>[1]);
    y -= 18;
  };

  const rule = () => {
    ensure(12);
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.6, color: line });
    y -= 12;
  };

  const bullets = (items: string[]) => {
    for (const it of items) {
      const lines = wrap(it, regular, 10.5, COL - 14);
      ensure(lines.length * 15.2);
      page.drawText('\u2022', { x: M + 2, y: y - 10.5, size: 10.5, font: regular, color: blue });
      for (const l of lines) {
        page.drawText(l, { x: M + 14, y: y - 10.5, size: 10.5, font: regular, color: ink });
        y -= 15.2;
      }
      y -= 2;
    }
  };

  /** Label on the left, value on the right, the way a booking reads. */
  const kv = (rows: [string, string][]) => {
    const labelW = 118;
    for (const [k, v] of rows) {
      if (!v) continue;
      const lines = wrap(v, regular, 10.5, COL - labelW);
      ensure(lines.length * 15.2 + 4);
      page.drawText(winAnsi(k).toUpperCase(), {
        x: M,
        y: y - 9.5,
        size: 7.5,
        font: bold,
        color: muted,
        characterSpacing: 1,
      } as Parameters<PDFPage['drawText']>[1]);
      for (const l of lines) {
        page.drawText(l, { x: M + labelW, y: y - 10.5, size: 10.5, font: regular, color: ink });
        y -= 15.2;
      }
      y -= 4;
    }
  };

  // --- Page one --------------------------------------------------------------

  newPage();

  if (logo) {
    const lw = 118;
    const lh = (logo.height / logo.width) * lw;
    page.drawRectangle({ x: M - 10, y: y - lh - 14, width: lw + 20, height: lh + 20, color: ink });
    page.drawImage(logo, { x: M, y: y - lh - 4, width: lw, height: lh });
  }

  const eb = `CREW BRIEFING \u00b7 ${winAnsi(b.role_label).toUpperCase()}`;
  page.drawText(eb, {
    x: W - M - bold.widthOfTextAtSize(eb, 8) - 8,
    y: y - 10,
    size: 8,
    font: bold,
    color: muted,
    characterSpacing: 1.2,
  } as Parameters<PDFPage['drawText']>[1]);
  if (b.reference) {
    page.drawText(b.reference, {
      x: W - M - regular.widthOfTextAtSize(b.reference, 9),
      y: y - 24,
      size: 9,
      font: regular,
      color: muted,
    });
  }
  y -= 54;

  text(b.title, { size: 21, font: bold, gap: 2 });
  const when =
    b.days.length > 1
      ? `${shortDay(b.days[0].day)} \u2013 ${longDate(`${b.days[b.days.length - 1].day}T12:00:00`)}`
      : longDate(b.starts_at);
  text(`${when}${b.city ? ` \u00b7 ${b.city}` : ''} \u00b7 for ${b.client}`, {
    size: 11,
    color: secondary,
    gap: 10,
  });

  text(`Your role: ${b.is_lead ? 'LEAD and ' : ''}${b.role_label}`, { size: 13, font: bold, gap: 2 });
  if (b.is_lead) {
    text(
      'You hold the overview on site: point of contact for the client and the crew, and the one who checks everything is in before anyone leaves. Price and planning still go through FEM.',
      { size: 10, color: secondary, gap: 6 },
    );
  }

  // The days, boxed, two to a row. Times are the thing people check twice,
  // and on a two-day job the Thursday half-day is the one they get wrong.
  {
    const eyebrowAt = (str: string, x: number, yy: number) =>
      page.drawText(winAnsi(str).toUpperCase(), {
        x,
        y: yy,
        size: 7.5,
        font: bold,
        color: muted,
        characterSpacing: 1,
      } as Parameters<PDFPage['drawText']>[1]);

    const drawTimes = (x: number, yy: number, on: string, cam: string, off: string) => {
      let bx = x;
      const slot = (label: string, value: string, highlight = false) => {
        if (!value) return;
        eyebrowAt(label, bx, yy);
        if (highlight) {
          const w = bold.widthOfTextAtSize(value, 14) + 12;
          page.drawRectangle({ x: bx - 6, y: yy - 23, width: w, height: 20, color: gold });
        }
        page.drawText(value, { x: bx, y: yy - 18, size: 14, font: bold, color: ink });
        bx += Math.max(70, bold.widthOfTextAtSize(value, 14) + 26);
      };
      slot('On site', on);
      slot('Camera ready', cam, true);
      slot('Wrapped', off);
    };

    const days = b.days;
    if (days.length === 0) {
      const boxH = b.due_on ? 56 : 44;
      ensure(boxH + 10);
      page.drawRectangle({ x: M, y: y - boxH, width: COL, height: boxH, color: panel, borderColor: line, borderWidth: 0.6 });
      page.drawText('No shoot day. Delivery only.', { x: M + 16, y: y - 26, size: 10.5, font: regular, color: secondary });
      if (b.due_on) {
        eyebrowAt('Deadline', M + 16, y - boxH + 14);
        page.drawText(shortDate(b.due_on), { x: M + 16 + 60, y: y - boxH + 12, size: 10.5, font: bold, color: ink });
      }
      y -= boxH + 14;
    } else {
      const perRow = days.length === 1 ? 1 : 2;
      const gap = 10;
      const w = (COL - gap * (perRow - 1)) / perRow;
      const boxH = 66;
      for (let i = 0; i < days.length; i += perRow) {
        ensure(boxH + 10);
        for (let j = 0; j < perRow && i + j < days.length; j++) {
          const d = days[i + j];
          const x = M + j * (w + gap);
          page.drawRectangle({ x, y: y - boxH, width: w, height: boxH, color: panel, borderColor: line, borderWidth: 0.6 });
          const head = `${days.length > 1 ? `Day ${i + j + 1} \u00b7 ` : ''}${shortDay(d.day)}${d.note ? ` \u00b7 ${d.note}` : ''}`;
          eyebrowAt(head, x + 14, y - 16);
          drawTimes(x + 14, y - 32, hhmm(d.on_site), hhmm(d.camera_ready), hhmm(d.wrapped));
        }
        y -= boxH + gap;
      }
      if (b.due_on) {
        ensure(20);
        eyebrowAt('Deadline', M, y - 8);
        page.drawText(shortDate(b.due_on), { x: M + 60, y: y - 10, size: 10.5, font: bold, color: ink });
        y -= 20;
      }
      y -= 6;
    }
  }

  if (b.briefing) {
    eyebrow('The job');
    text(b.briefing, { gap: 4 });
  }

  if (b.venue || b.city) {
    eyebrow('Where');
    text([b.venue, b.city].filter(Boolean).join(', '), { font: bold, size: 11.5, gap: 1 });
    const whereRows: [string, string][] = [];
    if (b.maps_url) whereRows.push(['Maps', b.maps_url]);
    if (b.parking) whereRows.push(['Parking', b.parking]);
    if (b.travel) whereRows.push(['Getting there', b.travel]);
    kv(whereRows);
  }

  eyebrow('Your booking');
  kv([
    ['Role', `${b.is_lead ? 'Lead \u00b7 ' : ''}${b.role_label}`],
    ['Fee', `${euro(b.fee_cents)} ex VAT`],
    ['Deadline', b.due_on ? shortDate(b.due_on) : ''],
    ['Bring', b.equipment.join(', ')],
    ['Dresscode', b.dresscode ?? ''],
    ['Reference', b.reference_link ?? ''],
  ]);

  if (b.expectations.length > 0) {
    eyebrow('What we expect');
    bullets(b.expectations);
  }

  if (b.shots.length > 0) {
    eyebrow('Shot list');
    bullets(b.shots);
  }

  {
    const d = b.delivery;
    const rows: [string, string][] = [
      ['First selection', d.firstSelection ?? ''],
      ['Full edit', d.fullEdit ?? ''],
      ['Format', d.format ?? ''],
      ['Save originals', d.retention ?? ''],
      ['Gallery', b.gallery_link ? `${b.gallery_link}${b.gallery_note ? ` \u2014 ${b.gallery_note}` : ''}` : ''],
      ['Invoice', 'Through the portal, not by email. The upload opens once you mark the files delivered.'],
    ];
    if (rows.some(([, v]) => v)) {
      eyebrow('What you deliver');
      kv(rows);
    }
  }

  if (b.team.length > 1) {
    eyebrow('Who you work with');
    const showPhone = b.is_lead;
    // One hours column per day, or one for the job. Fixed first two columns,
    // the days share what is left; the phone column takes its share off them.
    const dayCols = b.days.length > 1 ? b.days.map((d) => d.day) : [null];
    const phoneW = showPhone ? 84 : 0;
    const whoW = 128;
    const roleW = dayCols.length > 2 ? 110 : 150;
    const dayW = Math.max(56, (COL - whoW - roleW - phoneW) / dayCols.length);
    const head = ['Who', 'Role', ...dayCols.map((d) => (d ? shortDay(d) : 'Hours')), ...(showPhone ? ['Phone'] : [])];
    const widths = [whoW, roleW, ...dayCols.map(() => dayW), ...(showPhone ? [phoneW] : [])];

    ensure(18);
    let cx = M;
    head.forEach((h, i) => {
      page.drawText(winAnsi(h).toUpperCase(), {
        x: cx,
        y: y - 8,
        size: 7.5,
        font: bold,
        color: muted,
        characterSpacing: 1,
      } as Parameters<PDFPage['drawText']>[1]);
      cx += widths[i];
    });
    y -= 14;
    rule();
    for (const m of b.team) {
      ensure(18);
      const f = m.is_you ? bold : regular;
      cx = M;
      const who = `${m.is_you ? 'You' : m.name}${m.is_lead ? '  LEAD' : ''}`;
      page.drawText(winAnsi(who), { x: cx, y: y - 10, size: 10, font: f, color: ink });
      cx += whoW;
      page.drawText(winAnsi(m.role), { x: cx, y: y - 10, size: 9.5, font: f, color: secondary });
      cx += roleW;
      for (const d of dayCols) {
        const hours = d ? m.days[d] : `${hhmm(m.on_site)}\u2013${hhmm(m.wrapped)}`;
        page.drawText(hours ?? '\u2014', { x: cx, y: y - 10, size: 10, font: f, color: hours ? ink : muted });
        cx += dayW;
      }
      if (showPhone && m.phone) {
        page.drawText(winAnsi(m.phone), { x: cx, y: y - 10, size: 9.5, font: regular, color: blue });
      }
      y -= 16;
    }
    y -= 4;
  }

  eyebrow('Contacts');
  {
    const rows: [string, string][] = [];
    if (b.producer) {
      rows.push([
        'FEM',
        `${b.producer.name}${b.producer.phone ? ` \u00b7 ${b.producer.phone}` : ''}${b.producer.email ? ` \u00b7 ${b.producer.email}` : ''}`,
      ]);
    }
    if (b.client_contact) {
      rows.push([
        'Client',
        `${b.client_contact.name}, ${b.client_contact.company}${b.client_contact.phone ? ` \u00b7 ${b.client_contact.phone}` : ''}${b.client_contact.email ? ` \u00b7 ${b.client_contact.email}` : ''}`,
      ]);
    }
    rows.push(['Questions', MAIL_REPLY_TO || 'Through the portal']);
    kv(rows);
  }

  eyebrow('House rules');
  bullets([
    'Nothing on social media without agreeing it with FEM first: stills, behind the scenes and stories included. Do not tag the client.',
    'No direct contact with the client about price or planning. That goes through FEM' + (b.is_lead ? '' : ' or the lead') + '.',
    'Overtime after your wrap time only after checking with FEM.',
    'Thank everyone before you leave.',
  ]);

  // --- Footer on every page ----------------------------------------------------

  const stamp = `Generated ${shortDate(new Date().toISOString())}`;
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.6, color: line });
    pg.drawText(`Fast Elevate Media \u00b7 ${MAIL_REPLY_TO || 'fastelevatemedia.com'}`, {
      x: M,
      y: M - 20,
      size: 8,
      font: regular,
      color: muted,
    });
    const right = `Page ${i + 1} of ${pages.length} \u00b7 ${stamp}`;
    pg.drawText(right, {
      x: W - M - regular.widthOfTextAtSize(right, 8),
      y: M - 20,
      size: 8,
      font: regular,
      color: muted,
    });
  });

  return await doc.save();
}

function briefingFilename(b: Briefing): string {
  const safe = (s: string) => winAnsi(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, ' ');
  return `Briefing - ${safe(b.title)} - ${shortDate(b.starts_at).replace(/ /g, '-')}.pdf`;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** The PDF for a role, or nothing. A briefing that fails to render must not
    stop the booking mail: the page is still there, the file is a convenience. */
async function briefingAttachment(admin: SupabaseClient, roleId: string | undefined): Promise<Attachment[]> {
  if (!roleId) return [];
  try {
    const data = await briefingData(admin, roleId);
    if (!data) return [];
    const bytes = await briefingPdf(data);
    return [{ filename: briefingFilename(data), content: toBase64(bytes) }];
  } catch (err) {
    console.error('briefing pdf failed', roleId, err instanceof Error ? err.message : err);
    return [];
  }
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

    // The booking carries the briefing; so does a change to it, since the
    // copy in their pocket is now wrong.
    const kind = row.kind as string;
    const attachments =
      kind === 'booked' || kind === 'job-changed'
        ? await briefingAttachment(admin, (row.payload as Job | null)?.role_id)
        : [];

    const result = await sendMail(row.recipient_email as string, mail, attachments);

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
  cors = corsFor(req);
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
    role_id?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const action = payload.action ?? 'invite';
  if (!['invite', 'revoke', 'restore', 'set-role', 'notify', 'briefing'].includes(action)) {
    return json({ error: 'Unknown action.' }, 400);
  }

  const email = (payload.email ?? '').trim().toLowerCase();
  const fullName = (payload.full_name ?? '').trim();
  const role = (payload.role ?? 'freelancer') as Role;

  if (action === 'invite') {
    if (!email || !email.includes('@')) return json({ error: 'Give a valid email address.' }, 400);
    if (!GRANTABLE.includes(role)) return json({ error: 'Unknown role.' }, 400);
  } else if (action === 'set-role' && !GRANTABLE.includes(role)) {
    return json({ error: 'Unknown role.' }, 400);
  } else if (action === 'briefing' && !payload.role_id) {
    return json({ error: 'Say which role.' }, 400);
  } else if (!['notify', 'briefing'].includes(action) && !payload.target_id) {
    // Draining names nobody: it sends what the database already addressed.
    return json({ error: 'Say whose access to change.' }, 400);
  }

  // --- Step 1: who is asking, and are they allowed? -------------------------

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: caller } = await asCaller.auth.getUser();
  if (!caller?.user) return json({ error: 'Not signed in.' }, 401);

  // Draining the queue is not a privileged act -- it sends messages the database
  // already decided to send, to addresses it already chose, with no input from
  // the caller. Any signed-in account may kick it, which is what lets the portal
  // drain it on load without anyone waiting for a scheduler.
  //
  // Below getUser on purpose: the gateway only checks that the token is one of
  // ours, and the publishable key is a valid token of ours that anybody can
  // read out of the page. Without this line "signed in" was never actually
  // checked, and the queue could be flushed by a stranger.
  if (action === 'notify') {
    return await drainNotifications();
  }

  // The briefing as a file, for whoever may see the role. Row level security
  // answers that: the read below returns the row to the person booked on it
  // and to FEM, and nothing to anyone else.
  if (action === 'briefing') {
    const { data: allowed } = await asCaller
      .from('assignment_roles')
      .select('id')
      .eq('id', payload.role_id!)
      .maybeSingle();

    if (!allowed) return json({ error: 'Not your assignment.' }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Building a PDF costs real CPU. Thirty in ten minutes is more than any
    // person needs and less than a script wants; the log that enforces it is
    // the same one that says who fetched which briefing when.
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await admin
      .from('access_log')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', caller.user.id)
      .eq('action', 'downloaded the briefing')
      .gte('occurred_at', since);
    if ((count ?? 0) >= 30) return json({ error: 'Too many downloads. Try again in a few minutes.' }, 429);

    await admin.from('access_log').insert({
      actor_id: caller.user.id,
      action: 'downloaded the briefing',
      subject_type: 'assignment_role',
      subject_id: payload.role_id!,
    });

    const data = await briefingData(admin, payload.role_id!);
    if (!data) return json({ error: 'No such role.' }, 404);

    const bytes = await briefingPdf(data);
    return new Response(bytes, {
      headers: {
        ...cors,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${briefingFilename(data)}"`,
      },
    });
  }

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
