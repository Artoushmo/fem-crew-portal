export const freelancer = {
  firstName: 'Alex',
  initials: 'AL',
  name: 'Alex Larsen',
  email: 'alex@example.com',
  role: 'Photographer',
};

export const agreement = {
  year: 2026,
  signed: true,
  signedOn: '4 January 2026',
};

export const VAT_RATE = 0.21;

/** The seven stages every assignment moves through, from contract to payment. */
export const STAGES = [
  { key: 'contract', label: 'Contract signed', short: 'Contract' },
  { key: 'accepted', label: 'Assignment accepted', short: 'Accepted' },
  { key: 'briefing', label: 'Briefing reviewed', short: 'Briefing' },
  { key: 'shoot', label: 'Shoot day', short: 'Shoot' },
  { key: 'upload', label: 'Files uploaded', short: 'Upload' },
  { key: 'invoice', label: 'Invoice sent', short: 'Invoice' },
  { key: 'paid', label: 'Paid', short: 'Paid' },
] as const;

export type Status = 'action-required' | 'confirmed' | 'in-progress' | 'delivered' | 'completed';

export const STATUS_LABEL: Record<Status, string> = {
  'action-required': 'Action required',
  confirmed: 'Confirmed',
  'in-progress': 'In progress',
  delivered: 'Delivered',
  completed: 'Completed',
};

export type PaymentState = 'not-invoiced' | 'awaiting' | 'paid';

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  'not-invoiced': 'Not invoiced',
  awaiting: 'Awaiting payment',
  paid: 'Paid',
};

export interface Assignment {
  id: string;
  title: string;
  client: string;
  startsAt: string;
  dateLabel: string;
  /** Big three of the shoot day. */
  onSite: string;
  cameraReady: string;
  wrapped: string;
  city: string;
  venue: string;
  mapsUrl: string;
  /** Practical notes about getting there. */
  travel: string;
  parking: string;
  role: string;
  fee: number;
  status: Status;
  /** Index into STAGES: the stage currently in play. */
  stage: number;
  /** Completion date per stage; null where it has not happened yet. */
  stageDates: (string | null)[];
  nextAction: string;
  contact: { name: string; role: string; phone: string; email: string };
  crew: string[];
  briefing: string;
  expectations: string[];
  shots: string[];
  equipment: string[];
  dresscode: string;
  clientNotes: string;
  files: { name: string; kind: string; size: string }[];
  delivery: { firstSelection: string; fullEdit: string; format: string; retention: string };
  payment: { state: PaymentState; invoiceNumber?: string; invoicedOn?: string; paidOn?: string };
  calendar: { start: string; end: string };
}

export const assignments: Assignment[] = [
  {
    id: 'corporate-event-client-x',
    title: 'Corporate Event',
    client: 'Client X',
    startsAt: '2026-09-24T13:00:00+02:00',
    dateLabel: '24 September 2026',
    onSite: '12:30',
    cameraReady: '13:00',
    wrapped: '18:00',
    city: 'Amsterdam',
    venue: 'RAI Convention Centre',
    mapsUrl: 'https://maps.google.com/?q=RAI+Convention+Centre+Amsterdam',
    travel: 'Tram 4 stops at the door. Nearest parking is P1, entrance on Europaboulevard.',
    parking: 'Confirmed — P1, code at the desk',
    role: 'Photographer',
    fee: 450,
    status: 'confirmed',
    stage: 2,
    stageDates: ['4 Jan 2026', '2 Sep 2026', null, null, null, null, null],
    nextAction: 'Review briefing',
    contact: {
      name: 'Sanne de Vries',
      role: 'Producer, FEM',
      phone: '+31 6 12 34 56 78',
      email: 'sanne@fastelevatemedia.nl',
    },
    crew: ['Sanne de Vries — producer', 'Joost Meijer — second photographer'],
    briefing:
      'Annual partner event for roughly 300 guests. Coverage runs from the walk-in through the keynote to the closing drinks. The client wants the day to feel busy and warm, not staged.',
    expectations: [
      'Be on location at call time, ready to shoot',
      'Stay unobtrusive during the keynote — no flash in the main hall',
      'Check in with Sanne before the closing drinks',
    ],
    shots: [
      'Walk-in and registration desk',
      'Keynote speaker, wide and close',
      'Audience reactions from at least two angles',
      'Networking and closing drinks',
      'Five to ten detail shots (signage, catering, branding)',
    ],
    equipment: [
      'Two bodies',
      '24–70mm',
      '70–200mm',
      'On-camera flash',
      'Spare batteries',
      'Two cards',
    ],
    dresscode: 'Smart casual, dark colours. No branded clothing from other agencies.',
    clientNotes:
      'The CEO prefers to be photographed from their left. Two guests have asked not to be photographed — Sanne will point them out at call time.',
    files: [
      { name: 'Run of show', kind: 'PDF', size: '240 KB' },
      { name: 'Venue floorplan', kind: 'PDF', size: '1.1 MB' },
      { name: 'Client brand guide', kind: 'PDF', size: '3.4 MB' },
    ],
    delivery: {
      firstSelection: '20 images within 24 hours',
      fullEdit: 'Full edit within 5 working days',
      format: 'JPEG, full resolution, sRGB',
      retention: 'Keep raw files for 30 days',
    },
    payment: { state: 'not-invoiced' },
    calendar: { start: '20260924T110000Z', end: '20260924T160000Z' },
  },
  {
    id: 'product-launch-northwind',
    title: 'Product Launch',
    client: 'Northwind',
    startsAt: '2026-10-08T09:30:00+02:00',
    dateLabel: '8 October 2026',
    onSite: '09:00',
    cameraReady: '09:30',
    wrapped: '15:00',
    city: 'Rotterdam',
    venue: 'Fenix Food Factory',
    mapsUrl: 'https://maps.google.com/?q=Fenix+Food+Factory+Rotterdam',
    travel: 'Loading access via Veerlaan. Unload before 09:00, then move the van.',
    parking: 'Not confirmed yet',
    role: 'Videographer',
    fee: 780,
    status: 'action-required',
    stage: 1,
    stageDates: ['4 Jan 2026', null, null, null, null, null, null],
    nextAction: 'Accept assignment',
    contact: {
      name: 'Milan Bakker',
      role: 'Producer, FEM',
      phone: '+31 6 22 33 44 55',
      email: 'milan@fastelevatemedia.nl',
    },
    crew: ['Milan Bakker — producer'],
    briefing:
      'Half-day shoot for a product launch film. Interviews in the morning, b-roll of the product and the space in the afternoon.',
    expectations: [
      'Bring your own audio — lavs for two speakers',
      'Interviews are scheduled tight; keep setup under 20 minutes',
      'Log takes as you go so the edit can start the same week',
    ],
    shots: [
      'Two seated interviews, two-camera setup',
      'Product b-roll, minimum 15 usable shots',
      'Venue and atmosphere b-roll',
      'Clean audio for both speakers',
    ],
    equipment: [
      'Two cinema bodies',
      'Matched primes',
      'Two lav mics',
      'Shotgun mic',
      'Three-point lighting',
    ],
    dresscode: 'All black. You will be visible in the background of some shots.',
    clientNotes:
      'The product is under embargo until 10 October. Nothing may be posted or shared before then.',
    files: [{ name: 'Shot list draft', kind: 'PDF', size: '180 KB' }],
    delivery: {
      firstSelection: 'Rushes within 48 hours',
      fullEdit: 'No edit — footage only',
      format: 'Original codec, no transcodes',
      retention: 'Keep originals for 30 days',
    },
    payment: { state: 'not-invoiced' },
    calendar: { start: '20261008T073000Z', end: '20261008T130000Z' },
  },
  {
    id: 'rooftop-aerials-vestapark',
    title: 'Rooftop Aerials',
    client: 'Vesta Park',
    startsAt: '2026-08-12T07:00:00+02:00',
    dateLabel: '12 August 2026',
    onSite: '06:45',
    cameraReady: '07:00',
    wrapped: '10:00',
    city: 'Utrecht',
    venue: 'Vesta Park, building C',
    mapsUrl: 'https://maps.google.com/?q=Utrecht+Vesta+Park',
    travel: 'Roof access through the service lift, key from the site manager.',
    parking: 'Confirmed — on-site, spot 12',
    role: 'Drone operator',
    fee: 520,
    status: 'delivered',
    stage: 5,
    stageDates: [
      '4 Jan 2026',
      '20 Jul 2026',
      '1 Aug 2026',
      '12 Aug 2026',
      '12 Aug 2026',
      null,
      null,
    ],
    nextAction: 'Send your invoice',
    contact: {
      name: 'Sanne de Vries',
      role: 'Producer, FEM',
      phone: '+31 6 12 34 56 78',
      email: 'sanne@fastelevatemedia.nl',
    },
    crew: ['Sanne de Vries — producer', 'Ground crew arranged by FEM'],
    briefing:
      'Early-morning aerials of the completed building for the client’s leasing brochure. Golden hour, clear skies only — the shoot moves if the forecast turns.',
    expectations: [
      'Confirm airspace clearance the day before',
      'Bring your licence and insurance certificate',
      'Ground crew of one is arranged by FEM',
    ],
    shots: [
      'Four orbit shots at different heights',
      'Two reveal shots over the roofline',
      'Stills at 20MP minimum for print',
    ],
    equipment: ['Drone', 'ND filters', 'Spare props', 'Three batteries', 'Hi-vis vest'],
    dresscode: 'Hi-vis vest on the roof — supplied on site.',
    clientNotes: 'Neighbouring building D is still occupied; keep it out of frame where possible.',
    files: [{ name: 'Airspace clearance', kind: 'PDF', size: '96 KB' }],
    delivery: {
      firstSelection: 'Delivered 12 September',
      fullEdit: 'Awaiting client review',
      format: 'JPEG + original DNG',
      retention: 'Keep originals until sign-off',
    },
    payment: { state: 'not-invoiced' },
    calendar: { start: '20260812T050000Z', end: '20260812T080000Z' },
  },
  {
    id: 'summer-campaign-harbour',
    title: 'Summer Campaign',
    client: 'Harbour Co',
    startsAt: '2026-07-18T10:00:00+02:00',
    dateLabel: '18 July 2026',
    onSite: '09:30',
    cameraReady: '10:00',
    wrapped: '16:00',
    city: 'Scheveningen',
    venue: 'Noorderstrand',
    mapsUrl: 'https://maps.google.com/?q=Noorderstrand+Scheveningen',
    travel: 'Beach access at the north pavilion. No vehicles past the boulevard.',
    parking: 'Confirmed — boulevard, day ticket reimbursed',
    role: 'Photographer',
    fee: 640,
    status: 'completed',
    stage: 6,
    stageDates: [
      '4 Jan 2026',
      '2 Jun 2026',
      '10 Jun 2026',
      '18 Jul 2026',
      '19 Jul 2026',
      '21 Jul 2026',
      '1 Aug 2026',
    ],
    nextAction: 'Completed',
    contact: {
      name: 'Milan Bakker',
      role: 'Producer, FEM',
      phone: '+31 6 22 33 44 55',
      email: 'milan@fastelevatemedia.nl',
    },
    crew: ['Milan Bakker — producer', 'Client art director on set'],
    briefing: 'Beach lifestyle shoot for the summer campaign. Four models, natural light only.',
    expectations: ['Weather call made at 07:00 on the day', 'Client art director on set all day'],
    shots: ['60 selects delivered', 'Verticals for social from every setup'],
    equipment: ['One body', '35mm', '85mm', 'Reflector'],
    dresscode: 'Beachwear appropriate — you will be in and out of the water.',
    clientNotes: 'Delivered and signed off.',
    files: [],
    delivery: {
      firstSelection: 'Delivered 19 July',
      fullEdit: 'Signed off 21 July',
      format: 'JPEG, sRGB',
      retention: 'Archived',
    },
    payment: {
      state: 'paid',
      invoiceNumber: 'FEM-2026-0143',
      invoicedOn: '21 July 2026',
      paidOn: '1 August 2026',
    },
    calendar: { start: '20260718T080000Z', end: '20260718T140000Z' },
  },
];

export function getAssignment(id: string) {
  return assignments.find((a) => a.id === id);
}

export const nextAssignment =
  [...assignments]
    .filter((a) => a.status !== 'completed' && a.status !== 'delivered')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? assignments[0];

export const upcoming = [...assignments]
  .filter((a) => a.status !== 'completed')
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

export const past = [...assignments]
  .filter((a) => a.status === 'completed')
  .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

/** Shoot days still ahead, soonest first. */
export const scheduled = [...assignments]
  .filter((a) => a.stage < 3)
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

export interface ActionItem {
  key: string;
  label: string;
  detail: string;
  href: string;
  tone: 'act' | 'money';
}

/** Everything waiting on the freelancer, derived from stage — never hand-maintained.
    Ordered by urgency: contract first (it blocks everything), then unanswered
    offers, then briefings, then money already earned. */
export const actionQueue: ActionItem[] = [
  ...(agreement.signed
    ? []
    : [
        {
          key: 'agreement',
          label: `Sign Freelancer Agreement ${agreement.year}`,
          detail: 'Assignments cannot be confirmed without it',
          href: '/documents',
          tone: 'act' as const,
        },
      ]),
  ...assignments
    .filter((a) => a.stage === 1)
    .map((a) => ({
      key: `accept-${a.id}`,
      label: 'Accept assignment',
      detail: `${a.title} — ${a.client}, ${a.dateLabel}`,
      href: `/assignments/${a.id}`,
      tone: 'act' as const,
    })),
  ...assignments
    .filter((a) => a.stage === 2)
    .map((a) => ({
      key: `brief-${a.id}`,
      label: 'Review briefing',
      detail: `${a.title} — ${a.client}, ${a.dateLabel}`,
      href: `/assignments/${a.id}`,
      tone: 'act' as const,
    })),
  ...assignments
    .filter((a) => a.stage === 5 && a.payment.state === 'not-invoiced')
    .map((a) => ({
      key: `invoice-${a.id}`,
      label: 'Send your invoice',
      detail: `${a.title} — ${formatFeeRaw(a.fee)} waiting`,
      href: `/assignments/${a.id}`,
      tone: 'money' as const,
    })),
];

function formatFeeRaw(fee: number) {
  return `€${fee.toLocaleString('nl-NL')}`;
}

export function formatFee(fee: number) {
  return `€${fee.toLocaleString('nl-NL')}`;
}

export function withVat(fee: number) {
  return `€${(fee * (1 + VAT_RATE)).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Whole days from today to a shoot date. Call from the client only — a value
    computed during a static build would be frozen at build time. */
export function daysUntil(startsAt: string) {
  const day = 24 * 60 * 60 * 1000;
  const then = new Date(startsAt);
  const now = new Date();
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / day);
}

export function countdownLabel(startsAt: string) {
  const d = daysUntil(startsAt);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d > 1) return `In ${d} days`;
  if (d === -1) return 'Yesterday';
  return `${Math.abs(d)} days ago`;
}

/** Totals for the Payments screen. */
export const payments = {
  total: assignments.reduce((sum, a) => sum + a.fee, 0),
  paid: assignments
    .filter((a) => a.payment.state === 'paid')
    .reduce((sum, a) => sum + a.fee, 0),
  awaiting: assignments
    .filter((a) => a.payment.state === 'awaiting')
    .reduce((sum, a) => sum + a.fee, 0),
  toInvoice: assignments
    .filter((a) => a.payment.state === 'not-invoiced' && a.stage >= 4)
    .reduce((sum, a) => sum + a.fee, 0),
  count: assignments.length,
};

export function calendarLinks(a: Assignment, portalUrl: string) {
  const title = `${a.title} – ${a.client} (FEM)`;
  const details = [
    `On site ${a.onSite}, camera ready ${a.cameraReady}, wrap ${a.wrapped}.`,
    `Role: ${a.role}. Fee: ${formatFee(a.fee)}.`,
    `Assignment: ${portalUrl}`,
  ].join('\n');
  const location = `${a.venue}, ${a.city}`;

  const google =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${a.calendar.start}/${a.calendar.end}` +
    `&location=${encodeURIComponent(location)}` +
    `&details=${encodeURIComponent(details)}`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `SUMMARY:${title}`,
    `DTSTART:${a.calendar.start}`,
    `DTEND:${a.calendar.end}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${details.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return { google, ics, filename: `FEM-${a.id}.ics` };
}
