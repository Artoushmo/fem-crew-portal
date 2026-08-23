# FEM Crew Portal

Portal where Fast Elevate Media freelancers find everything about their next
assignment. Built from the Claude Design source
[`FEM Freelancer Portal.dc.html`](https://claude.ai/design/p/ba17e9f1-e3c8-42d5-be20-1092596c20f2)
and the assignments PDF.

**Live:** https://artoushmo.github.io/fem-crew-portal/

```bash
npm install
npm run dev
```

## Deploying

Every push to `main` rebuilds and republishes via
[`.github/workflows/pages.yml`](.github/workflows/pages.yml). Nothing to run by
hand.

All routes are statically prerenderable, so the site ships as plain files:

```bash
NEXT_STATIC_EXPORT=1 NEXT_BASE_PATH=/fem-crew-portal \
NEXT_PUBLIC_BASE_PATH=/fem-crew-portal npm run build   # → out/
```

GitHub Pages serves a project repo from `/<repo>/`, hence the base path. It has to
be passed twice: `NEXT_BASE_PATH` prefixes the framework's own URLs, and
`NEXT_PUBLIC_BASE_PATH` reaches the plain `<img>` tags in `Logo.tsx`, which Next
does not rewrite. The workflow also drops a `.nojekyll` file, without which Pages
runs the output through Jekyll and silently discards `_next/`.

## Working on this

A production build writes to the same `.next` the dev server serves from, which
leaves that server returning 500s. Build somewhere else while dev is running:

```bash
NEXT_BUILD_DIR=.next-build npm run build
```

## Screens

| Route | What it does |
| --- | --- |
| `/` | Action queue first — everything waiting on the freelancer across all assignments — then the next assignment with a live countdown, what follows it, and the money position. |
| `/assignments` | Expandable overview of every assignment, split open / finished. A row opens to reveal stage progress, timings, location, FEM contact, briefing summary, and the next action. |
| `/assignments/[id]` | The full job, in five tabs — see below. |
| `/payments` | Paid out / awaiting / ready to invoice tiles, then every assignment with its fee and payment state. |
| `/documents` | Current Freelancer Agreement with signed state, plus the archive. |
| `/profile` | Freelancer details, agreement status, and the demo reset. |

`/payments` is called Payments, not Earnings: what a freelancer comes here for is
when the money arrives, not a running income total.

## The workflow

Every assignment carries a `stage` index into the seven shared `STAGES`:

```
Contract signed → Assignment accepted → Briefing reviewed → Shoot day
→ Files uploaded → Invoice sent → Paid
```

The brief's original six stopped at "completed"; the last two were added because a
freelancer's job is not finished until the money lands, and that is what the
Payments screen tracks.

That single number drives the stepper, the progress bar in the list, which step
reads "Now", the status pill, and whether the Delivery and Payment tabs offer their
action or explain why it is not available yet. `stageDates` holds the completion
date per stage.

**The stages are actionable.** `StageAction` puts the current step's button at the
top of the assignment, and `advance()` moves it on, stamping today's date on the
step just completed. Two steps are gated, and say so rather than going quiet:

- nothing can be accepted without a signed agreement
- the shoot cannot be confirmed before its date

Sending the invoice is the one step with a second effect: it mints an invoice
number and flips the assignment to `awaiting`, which moves the money on the
Payments screen and the dashboard tiles. Confirming payment is FEM's job, not the
freelancer's, so stage 7 shows "Waiting on FEM" with no button.

Progress lives in `localStorage` under `fem.progress.v1` via
[`lib/assignment-state.tsx`](lib/assignment-state.tsx) — there is no backend yet.
Every screen reads that one store, so advancing an assignment updates the queue,
the list, the pills and the totals together. Profile has a reset, and a toggle for
the agreement so the contract gate can be demonstrated.

## The assignment screen

Five tabs rather than one long page — the freelancer needs a different slice at
different moments:

| Tab | For |
| --- | --- |
| The day | On the way there: timing as three big figures, where + Maps, parking, fee, who else is on it |
| Briefing | The night before: the job, what FEM expects, dresscode, client notes |
| Shots & kit | On location: must-have shots and equipment as **tickable checklists**, plus files |
| Delivery | After: what to deliver, in what format, by when |
| Payment | Fee, VAT breakdown, invoice state |

Checklist ticks live in `localStorage` (`fem.shots.<id>`, `fem.kit.<id>`) — they are
the freelancer's own working memory for the day, not something the server needs.

## The dashboard

`buildActionQueue` in `lib/assignments.ts` is **derived from stage**, never
maintained by hand: stage 1 produces "Accept assignment", stage 2 "Review briefing",
stage 4 "Upload your files", stage 5 "Send your invoice", and an unsigned agreement
jumps to the top because it blocks everything else. Advance an assignment and the
dashboard follows — press Accept and that row leaves the queue.

The countdown ("In 33 days") renders only after mount. The pages are statically
prerendered, so a server-computed value would freeze at build time and disagree
with the client during hydration.

## Navigation

**Desktop (≥768px):** obsidian rail on the left, 240px, collapsible to 76px via the
toggle beside the logo. Collapsed it shows icons only and swaps the lockup for the
circular mark; the choice persists in `localStorage` under `fem.rail.collapsed`. The
rail renders expanded on the server and adopts the stored value after mount, so
hydration cannot mismatch.

**Mobile (<768px):** no rail. The logo moves into the masthead and navigation sits
in the fixed bottom tab bar.

## The masthead

Every page opens with the same obsidian block, its lower edge cut into the shallow
upward chevron used between sections on the Fast Elevate Media site:

```css
clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - var(--fem-chevron)), 0 100%);
```

`--fem-chevron: clamp(14px, 3.4vw, 58px)` — the `vw` unit keeps the *angle* constant
rather than the depth, so the cut reads the same on a phone as on a wide desktop.
The block's `padding-bottom` is 0.72 × the chevron: content sits in a centred column
where the cut is at its shallowest, so it needs less clearance than the full depth.

## Logo

`public/logo.png` (full lockup) and `public/logo-mark.png` (circular mark, used in
the collapsed rail) are generated from `assets/logo-source.png`. The source is
light-on-black with no alpha, so it was treated as premultiplied over black —
alpha taken from the max channel, then unpremultiplied — which gives clean edges on
the `#121111` rail. Both are cropped to the artwork and downscaled to ~3× their
display size.

`components/Logo.tsx` probes for the files on mount rather than using `<img onError>`:
the load fails before React hydrates, so an error fallback would flash a
broken-image icon. Without either file it falls back to a `FEM.` wordmark.

## Deliberate changes from the design sources

1. **Action buttons stack below 480px.** In the `.dc.html` both pills sit in one flex
   row with `white-space: nowrap`, which pushes "Add to Calendar" outside the card on
   a 375px phone.
2. **The calendar menu closes on outside click and Escape**, and carries
   `aria-haspopup` / `aria-expanded`. In the hero it opens downward, since opening
   upward would run off the top of the page.
3. **Calendar events link back to the assignment** in the portal, per the brief.

## Design tokens

All in `:root` in [`app/globals.css`](app/globals.css), sampled from the PDF:

| | |
| --- | --- |
| Page | `#f6f5f5` |
| Obsidian chrome | `#121111` |
| Primary blue | `#4C72A9` (hover `#3c5c8a`) |
| Gold (fee, signed) | `#f2be50` |
| Text on dark | `#e4e2e1`, muted `#8b909a` |
| Timeline track | `#e8e8e8`, idle node `#9ca2af` |
| Type | Lexend 400–800 |

Single-theme by design, so there is no dark-mode token set; every colour is painted
explicitly.

## Structure

```
app/
  layout.tsx              fonts, Shell
  globals.css             tokens and all component CSS
  page.tsx                dashboard
  assignments/page.tsx    expandable overview
  assignments/[id]/       full assignment, tabbed
  payments/page.tsx       fees and invoice state
  documents/page.tsx      agreements
  profile/page.tsx
components/
  Shell.tsx               rail state; wraps the tree in AssignmentProvider
  StageAction.tsx         the current step's button and its blocked reasons
  DashboardView.tsx       } client screens, all reading the same
  AssignmentsView.tsx     } progress store, so one advance updates
  AssignmentDetail.tsx    } every one of them
  PaymentsView.tsx        }
  DocumentsView.tsx       }
  ProfileView.tsx         }
  Sidebar.tsx             desktop rail  (owns NAV + isActive)
  Masthead.tsx            obsidian block with the chevron cut
  BottomNav.tsx           mobile tab bar
  AssignmentList.tsx      expandable rows
  Stepper.tsx             seven-stage tracker, scrolls on narrow screens
  Tabs.tsx                WAI-ARIA tabs, arrow-key navigable
  Checklist.tsx           tickable shot list / packing list
  Countdown.tsx           client-only "in N days"
  StatusPill.tsx
  AddToCalendar.tsx       Google link + .ics download
  Logo.tsx
  Icons.tsx
lib/
  assignments.ts          seed content, stages, gating rules, calendar helpers
  assignment-state.tsx    the progress store: stage, dates, invoices, agreement
assets/
  logo-source.png         original artwork, not served
```

## Not built yet

`lib/assignments.ts` is the seed data and `localStorage` holds the progress on top
of it, so nothing survives a different browser and FEM cannot see any of it. Still
to do: a backend behind `assignment-state.tsx`, real file upload and download,
messaging with the producer, and auth.
