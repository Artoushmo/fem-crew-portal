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
    version: '1.1',
    date: '2026-09-03',
    summary: 'The first round of changes after testing 1.0 end to end.',
    changes: [
      {
        title: 'The menu follows the work',
        body: 'Clients, then Team, then Assignments. Setting up your first job now means working down the rail in the order you need it, rather than starting on the screen that can do nothing until the other two exist.',
        who: 'fem',
      },
      {
        title: 'Your profile keeps what you type',
        body: 'Switching tabs or changing your photo no longer clears the fields you were filling in. Every section used to reload itself from the database whenever anything on the page was saved.',
        who: 'crew',
      },
      {
        title: 'Add to Calendar works',
        body: 'All three calendars refused the date. Google, Apple and Outlook now all take the shoot, with the call times, the venue and a link back to the assignment.',
        who: 'crew',
      },
      {
        title: 'Fees say excluding VAT',
        body: 'A fee meaning two different numbers to two people is how an invoice comes back wrong.',
      },
      {
        title: 'Delivery format is a list',
        body: 'Resolution, colour space, file naming: one line each, instead of one line for all of it.',
        who: 'fem',
      },
      {
        title: 'A gallery on the job',
        body: 'When FEM has already made a Pixieset or similar, the link and the instructions go on the assignment. Delivering then means adding to it and confirming, rather than pasting a link back.',
      },
      {
        title: 'One standing condition on every assignment',
        body: 'Nothing from a job goes on social media without agreeing it with Fast Elevate Media first. Stills, behind the scenes and stories included.',
      },
      {
        title: 'How far you travel, not how many kilometres',
        body: 'Your own region, anywhere in the Netherlands, or abroad as well. A radius read precisely and matched nothing.',
        who: 'crew',
      },
      {
        title: 'The briefing has to be opened',
        body: 'That step now offers Read the briefing first. The confirm button appears once it has actually been open.',
        who: 'crew',
      },
      {
        title: 'Send your invoice with the step',
        body: 'Step six takes the PDF. It lands on the assignment, so FEM is not hunting through email for the document they are paying against.',
      },
      {
        title: 'Steps can go back',
        body: 'Clicked too soon? Go back a step, one at a time. FEM can undo a confirmed payment too. Every move is recorded: who, when, from which step to which, and whether it went forward or back. Nobody can edit or delete that record, FEM included.',
      },
      {
        title: 'The sign-in code has a box per digit',
        body: 'So you can see how long it is and how far through you are. Pasting and filling from the text message still work.',
      },
      {
        title: 'Who else is on it, only when there is',
        body: 'That list no longer appears with a single name in it when you are the only one booked.',
        who: 'crew',
      },
    ],
  },
  {
    version: '1.0',
    date: '2026-08-27',
    summary: 'The portal, end to end: sign in, get booked, deliver, invoice, get paid.',
    changes: [
      {
        title: 'Signing in without a password',
        body: 'A code by email, and an authenticator app for everyone at FEM. There is no password to forget or leak.',
      },
      {
        title: 'Your profile',
        body: 'Photo, crafts, kit, certificates and invoicing details. This is what FEM matches assignments against.',
        who: 'crew',
      },
      {
        title: 'Seven steps with consequences',
        body: 'From paperwork to payment. Each step opens the next, and the database enforces the order rather than the buttons.',
      },
      {
        title: 'Clients and assignments',
        body: 'A client book, and assignments with one line per person needed. A launch with a photographer, a videographer and a drone operator is one job with three roles.',
        who: 'fem',
      },
      {
        title: 'Finding crew',
        body: 'Ranked by craft, city and kit, with anyone already booked that day or carrying an expired certificate flagged rather than hidden.',
        who: 'fem',
      },
      {
        title: 'Email at every turn',
        body: 'Booked, unbooked, contract replaced, date moved, paid. FEM hears when someone accepts, signs, delivers and invoices.',
      },
      {
        title: 'Signatures you can prove',
        body: 'Every signature records who, when, from where, and a fingerprint of the exact document. Replace the document and the signature stops counting until it is signed again.',
      },
    ],
  },
];

export const CURRENT_VERSION = RELEASES[0].version;
