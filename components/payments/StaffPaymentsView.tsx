'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CRAFT_LABEL } from '@/lib/profile-types';
import { formatEuro, useShoots, type Role, type Shoot } from '@/lib/use-staff-assignments';
import { BrandLoader } from '../BrandLoader';
import { Masthead } from '../Masthead';

type Show = 'to-invoice' | 'to-pay' | 'paid' | 'all';

const LABEL: Record<Show, string> = {
  'to-invoice': 'To be invoiced',
  'to-pay': 'To pay',
  paid: 'Paid',
  all: 'Everything',
};

/** Days FEM allows itself between an invoice arriving and the money leaving.
    Not a per-invoice field: freelancers state their own terms and they differ,
    but what the page has to flag is our own lateness, and that is one number. */
const PAYMENT_TERM_DAYS = 14;

interface Line {
  role: Role;
  shoot: Shoot;
  bucket: Exclude<Show, 'all'> | 'open';
  /** Days since the thing we are waiting on started waiting. Null when nothing
      is waiting -- a paid line is not old, it is done. */
  waiting: number | null;
  /** Set on unpaid invoices only. Past means we are late, not them. */
  dueOn: Date | null;
  overdue: boolean;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

function waitLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/** Where the money is, per person on a job.
 *
 * Split by where it is stuck rather than listed by date, because the question a
 * producer arrives with is "what do I owe" and not "what happened when". The
 * dashboard tiles link straight into one of these buckets. */
export function StaffPaymentsView() {
  const { shoots, loading, error, confirmPayments, remindInvoice, undoPayment, fileUrl } =
    useShoots();
  const params = useSearchParams();

  const asked = params.get('show') as Show | null;
  const [show, setShow] = useState<Show>(asked && LABEL[asked] ? asked : 'to-pay');
  const [rowError, setRowError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const guard = async (fn: () => Promise<void>) => {
    setRowError(null);
    setNote(null);
    try {
      await fn();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'That did not work.');
    }
  };

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];

    for (const shoot of shoots) {
      for (const role of shoot.roles) {
        if (!role.freelancer_id) continue;

        const bucket: Line['bucket'] =
          role.payment_state === 'paid'
            ? 'paid'
            : role.payment_state === 'awaiting'
              ? 'to-pay'
              : role.stage >= 3
                ? 'to-invoice'
                : 'open';

        // What we are waiting on differs per bucket: their invoice, or our
        // payment. Both fall back to the shoot day, because a row with no date
        // at all would sort as brand new and quietly drop to the bottom.
        const since =
          bucket === 'to-pay'
            ? (role.invoiced_on ?? role.delivered_at ?? shoot.starts_at)
            : bucket === 'to-invoice'
              ? (role.delivered_at ?? shoot.starts_at)
              : null;

        const dueOn =
          bucket === 'to-pay' && role.invoiced_on
            ? new Date(
                new Date(role.invoiced_on).getTime() + PAYMENT_TERM_DAYS * 86_400_000,
              )
            : null;

        out.push({
          role,
          shoot,
          bucket,
          waiting: daysSince(since),
          dueOn,
          overdue: dueOn !== null && dueOn.getTime() < Date.now(),
        });
      }
    }

    return out;
  }, [shoots]);

  const totals = useMemo(() => {
    const t: Record<Show, number> = { 'to-invoice': 0, 'to-pay': 0, paid: 0, all: 0 };
    for (const l of lines) {
      t.all += l.role.fee_cents;
      if (l.bucket !== 'open') t[l.bucket] += l.role.fee_cents;
    }
    return t;
  }, [lines]);

  const shown = useMemo(() => {
    const list = show === 'all' ? [...lines] : lines.filter((l) => l.bucket === show);

    // Oldest first where something is owed: an invoice that has been sitting
    // three weeks has to stay at the top when a new shoot comes in. Paid rows
    // read the other way round -- the last thing you did is the one you check.
    return list.sort((a, b) => {
      if (show === 'paid') {
        return (b.role.paid_on ?? '').localeCompare(a.role.paid_on ?? '');
      }
      return (b.waiting ?? -1) - (a.waiting ?? -1);
    });
  }, [lines, show]);

  const payable = shown.filter((l) => l.bucket === 'to-pay');
  const selected = payable.filter((l) => picked.includes(l.role.id));
  const selectedTotal = selected.reduce((sum, l) => sum + l.role.fee_cents, 0);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const swap = (next: Show) => {
    setShow(next);
    setPicked([]);
    setRowError(null);
    setNote(null);
  };

  /** One line per payment, tab separated, in the order a bank's bulk upload
      asks for it. Plain text rather than a download: it goes straight into a
      spreadsheet or the bank's paste field, and the viewer cannot be handed a
      file anyway. */
  const copyForBank = async () => {
    const rows = selected.map((l) =>
      [
        l.role.iban ?? 'NO IBAN',
        l.role.company_name ?? l.role.freelancer_name ?? '',
        (l.role.fee_cents / 100).toFixed(2),
        l.role.invoice_number ?? l.shoot.reference ?? l.shoot.title,
      ].join('\t'),
    );

    await navigator.clipboard.writeText(
      ['IBAN\tName\tAmount\tReference', ...rows].join('\n'),
    );
    setNote(`${rows.length} line${rows.length === 1 ? '' : 's'} copied.`);
  };

  const missingIban = selected.filter((l) => !l.role.iban).length;

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Payments</h1>
        <p className="hero__sub">
          {formatEuro(totals['to-pay'])} waiting to go out
          {totals['to-invoice'] > 0 && `, ${formatEuro(totals['to-invoice'])} not yet invoiced`}
        </p>
      </Masthead>

      <main className="content content--table">
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <BrandLoader label="Loading payments" />
        ) : (
          <>
            <div className="toolbar">
              <div className="segmented" role="tablist" aria-label="Which payments">
                {(Object.keys(LABEL) as Show[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={show === k}
                    className={`segmented__item ${show === k ? 'is-on' : ''}`}
                    onClick={() => swap(k)}
                  >
                    {LABEL[k]}
                    <span className="segmented__count">
                      {k === 'all' ? lines.length : lines.filter((l) => l.bucket === k).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {rowError && (
              <p className="auth__error" role="alert">
                {rowError}
              </p>
            )}

            {note && <p className="state state--done">{note}</p>}

            {selected.length > 0 && (
              <div className="paybar">
                <span className="paybar__count">
                  {selected.length} selected · {formatEuro(selectedTotal)}
                </span>

                {missingIban > 0 && (
                  <span className="tag tag--warn">
                    {missingIban} without IBAN
                  </span>
                )}

                <span className="paybar__acts">
                  <button
                    type="button"
                    className="link-arrow link-arrow--button"
                    onClick={() => guard(copyForBank)}
                  >
                    Copy for the bank
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={busy}
                    onClick={() =>
                      guard(async () => {
                        setBusy(true);
                        try {
                          const ids = selected.map((l) => l.role.id);
                          const { done, failed } = await confirmPayments(ids);
                          setPicked([]);
                          setNote(`${done} marked paid.`);
                          if (failed.length > 0) setRowError(failed[0]);
                        } finally {
                          setBusy(false);
                        }
                      })
                    }
                  >
                    {busy ? 'Marking...' : `Mark ${selected.length} paid`}
                  </button>
                </span>
              </div>
            )}

            {shown.length === 0 ? (
              <p className="state state--idle">
                {show === 'to-pay'
                  ? 'Nothing to pay.'
                  : show === 'to-invoice'
                    ? 'Nothing waiting on an invoice.'
                    : 'Nothing here.'}
              </p>
            ) : (
              <ul className="list">
                {shown.map(({ role, shoot, bucket, waiting, dueOn, overdue }) => {
                  const open = openId === role.id;

                  return (
                    <li key={role.id} className={`row ${open ? 'row--open' : ''}`}>
                      <div className="payline">
                        {bucket === 'to-pay' && (
                          <input
                            type="checkbox"
                            className="payline__pick"
                            checked={picked.includes(role.id)}
                            onChange={() => toggle(role.id)}
                            aria-label={`Select ${shoot.title} for payment`}
                          />
                        )}

                        <div className="payline__what">
                          <Link className="job__title job__title--link" href={`/assignments?job=${shoot.id}`}>
                            {shoot.title}
                            {shoot.client_name ? ` — ${shoot.client_name}` : ''}
                          </Link>
                          <span className="job__meta">
                            {role.freelancer_name ?? 'Unnamed'} · {CRAFT_LABEL[role.craft]} ·{' '}
                            {dateLabel(shoot.starts_at)}
                          </span>
                        </div>

                        <span className="payline__age">
                          {bucket === 'paid'
                            ? role.paid_on
                              ? `Paid ${dateLabel(role.paid_on)}`
                              : 'Paid'
                            : bucket === 'to-pay'
                              ? dueOn
                                ? `Due ${dateLabel(dueOn.toISOString())}`
                                : `Waiting ${waitLabel(waiting) ?? ''}`
                              : bucket === 'to-invoice'
                                ? `Open ${waitLabel(waiting) ?? ''}`
                                : ''}
                        </span>

                        <span
                          className={`tag ${
                            overdue
                              ? 'tag--warn'
                              : bucket === 'paid'
                                ? 'tag--ok'
                                : 'tag--wait'
                          }`}
                        >
                          {overdue
                            ? 'Overdue'
                            : bucket === 'paid'
                              ? 'Paid'
                              : bucket === 'to-pay'
                                ? 'Invoice in'
                                : bucket === 'to-invoice'
                                  ? 'Awaiting invoice'
                                  : 'In progress'}
                        </span>

                        <span className="roles__fee">{formatEuro(role.fee_cents)}</span>

                        <span className="payline__controls">
                          {bucket === 'to-invoice' && (
                            <button
                              type="button"
                              className="btn btn--outline btn--sm"
                              onClick={() => guard(() => remindInvoice(role.id))}
                            >
                              {role.reminded_at ? 'Remind again' : 'Remind'}
                            </button>
                          )}

                          {bucket === 'to-pay' && (
                            <button
                              type="button"
                              className="btn btn--outline btn--sm"
                              onClick={() =>
                                guard(async () => {
                                  const { failed } = await confirmPayments([role.id]);
                                  if (failed.length > 0) setRowError(failed[0]);
                                })
                              }
                            >
                              Mark paid
                            </button>
                          )}

                          {bucket === 'paid' && (
                            <button
                              type="button"
                              className="link-arrow link-arrow--button link-arrow--danger"
                              onClick={() => guard(() => undoPayment(role.id))}
                            >
                              Undo
                            </button>
                          )}

                          <button
                            type="button"
                            className="link-arrow link-arrow--button"
                            aria-expanded={open}
                            onClick={() => setOpenId(open ? null : role.id)}
                          >
                            {open ? 'Close' : 'Details'}
                          </button>
                        </span>
                      </div>

                      {open && (
                        <div className="paydetail">
                          <Copyable label="IBAN" value={role.iban} />
                          <Copyable
                            label="Account name"
                            value={role.company_name ?? role.freelancer_name}
                          />
                          <Copyable
                            label="Reference"
                            value={role.invoice_number ?? shoot.reference}
                          />
                          <Copyable label="Amount" value={(role.fee_cents / 100).toFixed(2)} />
                          <Copyable label="VAT number" value={role.vat_number} />

                          <div className="paydetail__item">
                            <span className="paydetail__label">Dates</span>
                            <span className="paydetail__value">
                              {[
                                role.delivered_at && `Delivered ${dateLabel(role.delivered_at)}`,
                                role.invoiced_on && `Invoiced ${dateLabel(role.invoiced_on)}`,
                                role.reminded_at && `Reminded ${dateLabel(role.reminded_at)}`,
                                role.paid_on && `Paid ${dateLabel(role.paid_on)}`,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Nothing yet'}
                            </span>
                          </div>

                          {role.invoice_path && (
                            <div className="paydetail__item">
                              <span className="paydetail__label">Invoice</span>
                              <button
                                type="button"
                                className="link-arrow link-arrow--button"
                                onClick={() =>
                                  guard(async () => {
                                    window.open(
                                      await fileUrl(role.invoice_path!),
                                      '_blank',
                                      'noopener',
                                    );
                                  })
                                }
                              >
                                {role.invoice_name ?? 'Open'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}

/** A value you are about to type into a bank. Copying it beats reading it off
    the screen, which is where a transposed digit comes from. */
function Copyable({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="paydetail__item">
      <span className="paydetail__label">{label}</span>
      {value ? (
        <button
          type="button"
          className="paydetail__value paydetail__value--copy"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : value}
        </button>
      ) : (
        <span className="paydetail__value paydetail__value--missing">Not on file</span>
      )}
    </div>
  );
}
