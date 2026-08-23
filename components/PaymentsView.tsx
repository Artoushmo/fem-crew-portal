'use client';

import Link from 'next/link';
import { useAssignments } from '@/lib/assignment-state';
import { PAYMENT_LABEL, formatFee } from '@/lib/assignments';
import { Masthead } from './Masthead';

/** Named "Payments" rather than "Earnings": what the freelancer comes here for is
    when the money arrives, not a running income total. */
export function PaymentsView() {
  const assignments = useAssignments();
  const rows = [...assignments].sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const sum = (fn: (a: (typeof assignments)[number]) => boolean) =>
    assignments.filter(fn).reduce((total, a) => total + a.fee, 0);

  const paid = sum((a) => a.payment.state === 'paid');
  const awaiting = sum((a) => a.payment.state === 'awaiting');
  const toInvoice = sum((a) => a.stage === 5);

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Payments</h1>
        <p className="hero__sub">Fees, invoices and what is still outstanding.</p>
      </Masthead>

      <main className="content content--wide">
        <div className="tiles">
          <Tile label="Paid out" value={formatFee(paid)} />
          <Tile label="Awaiting payment" value={formatFee(awaiting)} tone="wait" />
          <Tile label="Ready to invoice" value={formatFee(toInvoice)} tone="act" />
          <Tile label="Assignments" value={String(assignments.length)} />
        </div>

        <p className="eyebrow eyebrow--spaced">Every assignment</p>

        <ul className="list">
          {rows.map((a) => (
            <li key={a.id} className="row">
              <Link href={`/assignments/${a.id}`} className="payrow">
                <span className="payrow__main">
                  <span className="row__title">{a.title}</span>
                  <span className="row__client">
                    {a.dateLabel} · {a.client} · {a.role}
                  </span>
                </span>
                <span className="payrow__fee">{formatFee(a.fee)}</span>
                <span className={`pay pay--${a.payment.state}`}>
                  {a.payment.state === 'not-invoiced' && a.stage === 5
                    ? 'Ready to invoice'
                    : PAYMENT_LABEL[a.payment.state]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'wait' | 'act' }) {
  return (
    <div className={`tile ${tone ? `tile--${tone}` : ''}`}>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
    </div>
  );
}
