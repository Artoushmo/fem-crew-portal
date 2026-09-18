'use client';

import { useMemo, useState } from 'react';
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

interface Line {
  role: Role;
  shoot: Shoot;
  bucket: Exclude<Show, 'all'> | 'open';
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Where the money is, per person on a job.
 *
 * Split by where it is stuck rather than listed by date, because the question a
 * producer arrives with is "what do I owe" and not "what happened when". The
 * dashboard tiles link straight into one of these buckets. */
export function StaffPaymentsView() {
  const { shoots, loading, error, confirmPayment, undoPayment, fileUrl } = useShoots();
  const params = useSearchParams();

  const asked = params.get('show') as Show | null;
  const [show, setShow] = useState<Show>(asked && LABEL[asked] ? asked : 'to-pay');
  const [rowError, setRowError] = useState<string | null>(null);

  const guard = async (fn: () => Promise<void>) => {
    setRowError(null);
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

        out.push({ role, shoot, bucket });
      }
    }

    return out.sort((a, b) => b.shoot.starts_at.localeCompare(a.shoot.starts_at));
  }, [shoots]);

  const totals = useMemo(() => {
    const t: Record<Show, number> = { 'to-invoice': 0, 'to-pay': 0, paid: 0, all: 0 };
    for (const l of lines) {
      t.all += l.role.fee_cents;
      if (l.bucket !== 'open') t[l.bucket] += l.role.fee_cents;
    }
    return t;
  }, [lines]);

  const shown = show === 'all' ? lines : lines.filter((l) => l.bucket === show);

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
                    onClick={() => setShow(k)}
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
                {shown.map(({ role, shoot, bucket }) => (
                  <li key={role.id} className="row">
                    <div className="payline">
                      <div className="payline__what">
                        <span className="job__title">
                          {shoot.title}
                          {shoot.client_name ? ` — ${shoot.client_name}` : ''}
                        </span>
                        <span className="job__meta">
                          {role.freelancer_name ?? 'Unnamed'} · {CRAFT_LABEL[role.craft]} ·{' '}
                          {dateLabel(shoot.starts_at)}
                        </span>
                      </div>

                      <span className={`tag ${bucket === 'paid' ? 'tag--ok' : 'tag--wait'}`}>
                        {bucket === 'paid'
                          ? 'Paid'
                          : bucket === 'to-pay'
                            ? 'Invoice in'
                            : bucket === 'to-invoice'
                              ? 'Awaiting invoice'
                              : 'In progress'}
                      </span>

                      <span className="roles__fee">{formatEuro(role.fee_cents)}</span>

                      <span className="payline__controls">
                        {role.invoice_path && (
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
                            Invoice
                          </button>
                        )}

                        {bucket === 'to-pay' && (
                          <button
                            type="button"
                            className="btn btn--outline btn--sm"
                            onClick={() => guard(() => confirmPayment(role.id))}
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
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
