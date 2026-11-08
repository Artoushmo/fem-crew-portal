/** What changed, and when.
 *
 * Kept in the code rather than a table, because it changes when the code
 * changes. A database version would be a second thing to remember to update,
 * and the one that gets forgotten is the one people read.
 *
 * Newest first. `current` marks the release that is live; it moves when the
 * next one ships.
 */

export interface Release {
  version: string;
  /** ISO date, rendered in the reader's locale. */
  date: string;
  /** One line on what this release is about. */
  summary: string;
  changes: {
    title: string;
    body: string;
    /** Who it matters to. Both, when it is genuinely both. */
    who?: 'crew' | 'fem';
  }[];
}

export const RELEASES: Release[] = [
  {
    version: '2.0',
    date: '2026-11-08',
    summary: 'Jobs over several days, a lead on site, and the briefing as a PDF.',
    changes: [
      {
        title: 'A job can take several days',
        body: 'Each day has its own times. Everyone is on every day unless their role says otherwise.',
      },
      {
        title: 'The briefing comes as a PDF',
        body: 'Attached to the booking and to every published change. Also a button on the job, for a venue without signal.',
      },
      {
        title: 'One lead per job',
        body: 'Point of contact on site. Sees the client contact and the crew\u2019s numbers. Nobody else does.',
      },
      {
        title: 'Who is on it, and when',
        body: 'Everyone sees the team with their hours per day.',
        who: 'crew',
      },
      {
        title: 'Picking is not telling',
        body: 'Choosing someone in Find someone is internal. The booking goes out when you publish.',
        who: 'fem',
      },
      {
        title: 'Role details start as the job',
        body: 'Open a role and the job\u2019s briefing is already there. Change what differs for that person.',
        who: 'fem',
      },
      {
        title: 'Briefing step opens the briefing',
        body: 'At step 2 the page opens on the briefing tab.',
        who: 'crew',
      },
      {
        title: 'Pay now',
        body: 'On a job, Pay now goes to Payments with that row open: invoice, IBAN, amount.',
        who: 'fem',
      },
      {
        title: 'Calendar per day',
        body: 'Apple gets all days in one file. Google and Outlook one entry per day.',
        who: 'crew',
      },
    ],
  },
  {
    version: '1.3',
    date: '2026-09-23',
    summary: 'Per-person details, saving without sending, and a payments page to work from.',
    changes: [
      {
        title: 'Each role has its own times, deadline and briefing',
        body: 'The reel due tomorrow, the stills on Friday. Empty means the same as the job.',
        who: 'fem',
      },
      {
        title: 'Save, then publish',
        body: 'Edits pile up. Publish sends one message naming everything since the last one.',
        who: 'fem',
      },
      {
        title: 'No contract per job',
        body: 'Only the yearly Freelancer Agreement. Without it, no booking and no accepting.',
      },
      {
        title: 'Documents is your administration',
        body: 'Your agreement and every invoice, with amount and status.',
        who: 'crew',
      },
      {
        title: 'One account, two hats',
        body: 'Someone at FEM who also shoots switches between Fast Elevate Media and Crew in the account menu. Replaces the role preview.',
      },
      {
        title: 'Payments you can work from',
        body: 'Remind for a missing invoice. Oldest first, due dates, overdue flagged. Open a row for IBAN and reference. Tick several, mark paid, copy for the bank.',
        who: 'fem',
      },
      {
        title: 'FEM can move a step',
        body: 'Minus and plus on every role. The ledger records who moved it.',
        who: 'fem',
      },
    ],
  },
  {
    version: '1.2',
    date: '2026-09-13',
    summary: 'Six steps, a list view, and shorter copy throughout.',
    changes: [
      {
        title: 'Six steps, not seven',
        body: 'Signing is a condition now, not a step. No booking and no accepting without a signed agreement.',
      },
      {
        title: 'Accepting is final',
        body: 'Every other step can go back. This one cannot.',
      },
      {
        title: 'Delivering is two buttons',
        body: 'Add a link, or mark it delivered. No link required.',
        who: 'crew',
      },
      {
        title: 'Assignments as a list',
        body: 'Reference, progress, status, client, crew and fee on one line.',
        who: 'fem',
      },
      {
        title: 'Every job has a number',
        body: 'FEM-2026-0001. Something to put in a subject line.',
      },
      {
        title: 'Payments for FEM',
        body: 'Split by where the money is stuck. The dashboard tiles open the right one.',
        who: 'fem',
      },
      {
        title: 'Counts on the menu',
        body: 'Assignments and Payments show what is outstanding.',
      },
      {
        title: 'View the portal as your crew',
        body: 'Switch role from the account menu without signing out. Your own access is unchanged.',
        who: 'fem',
      },
      {
        title: 'Shorter everywhere',
        body: 'Hints, empty states and warnings cut back to what they had to say.',
      },
    ],
  },
  {
    version: '1.1',
    date: '2026-09-03',
    summary: 'First round of changes after testing.',
    changes: [
      {
        title: 'The menu follows the work',
        body: 'Clients, then Team, then Assignments — the order you actually need them in.',
        who: 'fem',
      },
      {
        title: 'Your profile keeps what you type',
        body: 'Switching tabs or changing your photo no longer clears what you were filling in.',
        who: 'crew',
      },
      {
        title: 'Add to Calendar works',
        body: 'Google, Apple and Outlook all take the shoot now, with times, venue and a link back.',
        who: 'crew',
      },
      {
        title: 'Fees say excluding VAT',
        body: 'So a fee means the same number to both sides.',
      },
      {
        title: 'Delivery format is a list',
        body: 'Resolution, colour space, file naming — one line each.',
        who: 'fem',
      },
      {
        title: 'A gallery on the job',
        body: 'A Pixieset link on the assignment. Delivering means adding to it and confirming.',
      },
      {
        title: 'One standing condition on every assignment',
        body: 'Nothing on social media without agreeing it with FEM first.',
      },
      {
        title: 'How far you travel, not how many kilometres',
        body: 'Your own region, the Netherlands, or abroad as well.',
        who: 'crew',
      },
      {
        title: 'The briefing has to be opened',
        body: 'The confirm button appears once the briefing has been open.',
        who: 'crew',
      },
      {
        title: 'Send your invoice with the step',
        body: 'Step six takes the PDF. It lands on the assignment.',
      },
      {
        title: 'Steps can go back',
        body: 'One step at a time, and recorded: who, when, forward or back. FEM can undo a payment too.',
      },
      {
        title: 'The sign-in code has a box per digit',
        body: 'One box per digit. Pasting and SMS autofill still work.',
      },
      {
        title: 'Who else is on it, only when there is',
        body: 'Gone when you are the only one booked.',
        who: 'crew',
      },
    ],
  },
  {
    version: '1.0',
    date: '2026-08-27',
    summary: 'Sign in, get booked, deliver, invoice, get paid.',
    changes: [
      {
        title: 'Signing in without a password',
        body: 'A code by email, and an authenticator for everyone at FEM.',
      },
      {
        title: 'Your profile',
        body: 'Photo, crafts, kit, certificates, invoicing. What FEM matches on.',
        who: 'crew',
      },
      {
        title: 'Steps with consequences',
        body: 'Each step opens the next, enforced by the database.',
      },
      {
        title: 'Clients and assignments',
        body: 'One line per person needed. Three crew on a launch is one job with three roles.',
        who: 'fem',
      },
      {
        title: 'Finding crew',
        body: 'Ranked by craft, city and kit. Clashes and expired certificates are flagged.',
        who: 'fem',
      },
      {
        title: 'Email at every turn',
        body: 'Booked, unbooked, date moved, paid. FEM hears about accepts, deliveries and invoices.',
      },
      {
        title: 'Signatures you can prove',
        body: 'Who, when, from where, and a fingerprint of the document. Replace it and the signature drops.',
      },
    ],
  },
];

export const CURRENT_VERSION = RELEASES[0].version;
