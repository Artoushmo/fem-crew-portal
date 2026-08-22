import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCalendar } from '@/components/AddToCalendar';
import { Checklist } from '@/components/Checklist';
import { Masthead } from '@/components/Masthead';
import { StatusPill } from '@/components/StatusPill';
import { Stepper } from '@/components/Stepper';
import { Tabs } from '@/components/Tabs';
import {
  PAYMENT_LABEL,
  VAT_RATE,
  assignments,
  formatFee,
  getAssignment,
  withVat,
  type Assignment,
} from '@/lib/assignments';

export function generateStaticParams() {
  return assignments.map((a) => ({ id: a.id }));
}

export default function AssignmentDetail({ params }: { params: { id: string } }) {
  const a = getAssignment(params.id);
  if (!a) notFound();

  return (
    <>
      <Masthead>
        <Link href="/assignments" className="hero__back">
          ← All assignments
        </Link>
        <h1 className="hero__title">
          {a.title}
          <br />
          {a.client}
        </h1>
        <div className="hero__chips">
          <StatusPill status={a.status} onDark />
          <span className="chip">{a.role}</span>
          <span className="chip">{a.dateLabel}</span>
        </div>
      </Masthead>

      <main className="content content--wide">
        <Stepper
          stage={a.stage}
          dates={a.stageDates}
          complete={a.status === 'completed'}
        />

        <Tabs
          tabs={[
            { id: 'day', label: 'The day', content: <DayTab a={a} /> },
            { id: 'briefing', label: 'Briefing', content: <BriefingTab a={a} /> },
            { id: 'shots', label: 'Shots & kit', content: <ShotsTab a={a} /> },
            { id: 'delivery', label: 'Delivery', content: <DeliveryTab a={a} /> },
            { id: 'payment', label: 'Payment', content: <PaymentTab a={a} /> },
          ]}
        />
      </main>
    </>
  );
}

function DayTab({ a }: { a: Assignment }) {
  return (
    <>
      <section className="panel">
        <h2 className="panel__title">Timing</h2>
        <div className="times">
          <Time label="On site" value={a.onSite} />
          <Time label="Camera ready" value={a.cameraReady} />
          <Time label="Wrapped" value={a.wrapped} />
        </div>
      </section>

      <section className="panel">
        <div className="panel__row">
          <div>
            <h2 className="panel__title">Where</h2>
            <p className="place">{a.venue}</p>
            <p className="place__city">{a.city}</p>
          </div>
          <a className="btn btn--outline btn--sm" href={a.mapsUrl} target="_blank" rel="noopener noreferrer">
            Maps ↗
          </a>
        </div>

        <dl className="mini">
          <div>
            <dt>Parking</dt>
            <dd className={a.parking.startsWith('Not') ? 'mini__warn' : undefined}>{a.parking}</dd>
          </div>
          <div>
            <dt>Getting there</dt>
            <dd>{a.travel}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2 className="panel__title">Your fee</h2>
        <p className="fee">
          {formatFee(a.fee)} <span>excl. VAT</span>
        </p>
        <p className="fee__sub">
          {withVat(a.fee)} incl. {Math.round(VAT_RATE * 100)}% VAT
        </p>
      </section>

      <section className="panel">
        <h2 className="panel__title">Who else is on it</h2>
        <ul className="people">
          {a.crew.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <div className="contact">
          <div>
            <p className="contact__name">{a.contact.name}</p>
            <p className="contact__role">{a.contact.role}</p>
          </div>
          <p className="contact__links">
            <a href={`tel:${a.contact.phone.replace(/\s/g, '')}`}>{a.contact.phone}</a>
            <a href={`mailto:${a.contact.email}`}>{a.contact.email}</a>
          </p>
        </div>
      </section>

      <div className="panel__actions">
        <AddToCalendar assignment={a} />
      </div>
    </>
  );
}

function BriefingTab({ a }: { a: Assignment }) {
  return (
    <>
      <section className="panel panel--lead">
        <h2 className="panel__title">The job</h2>
        <p className="prose">{a.briefing}</p>
      </section>

      <section className="panel">
        <h2 className="panel__title">What FEM expects</h2>
        <ul className="ticks">
          {a.expectations.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>

      <div className="panel__pair">
        <section className="panel">
          <h2 className="panel__title">Dresscode</h2>
          <p className="prose">{a.dresscode}</p>
        </section>

        <section className="panel panel--note">
          <h2 className="panel__title">Client notes</h2>
          <p className="prose">{a.clientNotes}</p>
        </section>
      </div>
    </>
  );
}

function ShotsTab({ a }: { a: Assignment }) {
  return (
    <>
      <section className="panel">
        <h2 className="panel__title">Must-have shots</h2>
        <p className="panel__hint">Tick these off as you go — saved on this device.</p>
        <Checklist storageKey={`fem.shots.${a.id}`} items={a.shots} />
      </section>

      <section className="panel">
        <h2 className="panel__title">Equipment</h2>
        <p className="panel__hint">Your packing list.</p>
        <Checklist storageKey={`fem.kit.${a.id}`} items={a.equipment} columns />
      </section>

      {a.files.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Files</h2>
          <ul className="files">
            {a.files.map((f) => (
              <li key={f.name}>
                <button type="button" className="file">
                  <span className="file__kind">{f.kind}</span>
                  <span className="file__name">{f.name}</span>
                  <span className="file__size">{f.size}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function DeliveryTab({ a }: { a: Assignment }) {
  return (
    <>
      <section className="panel">
        <h2 className="panel__title">What to deliver</h2>
        <dl className="specs">
          <div>
            <dt>First selection</dt>
            <dd>{a.delivery.firstSelection}</dd>
          </div>
          <div>
            <dt>Full edit</dt>
            <dd>{a.delivery.fullEdit}</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{a.delivery.format}</dd>
          </div>
          <div>
            <dt>Originals</dt>
            <dd>{a.delivery.retention}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2 className="panel__title">Upload</h2>
        {a.stage >= 4 ? (
          <p className="state state--ok">Files uploaded {a.stageDates[4]}.</p>
        ) : (
          <>
            <p className="panel__hint">Available once the shoot day is done.</p>
            <button type="button" className="btn btn--primary" disabled>
              Upload files
            </button>
          </>
        )}
      </section>
    </>
  );
}

function PaymentTab({ a }: { a: Assignment }) {
  const { state, invoiceNumber, invoicedOn, paidOn } = a.payment;

  return (
    <>
      <section className="panel">
        <h2 className="panel__title">Amount</h2>
        <dl className="specs">
          <div>
            <dt>Fee</dt>
            <dd>{formatFee(a.fee)}</dd>
          </div>
          <div>
            <dt>VAT {Math.round(VAT_RATE * 100)}%</dt>
            <dd>{formatFee(Math.round(a.fee * VAT_RATE))}</dd>
          </div>
          <div className="specs__total">
            <dt>Total</dt>
            <dd>{withVat(a.fee)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2 className="panel__title">Invoice</h2>

        {state === 'paid' && (
          <>
            <p className="state state--ok">Paid on {paidOn}.</p>
            <dl className="mini">
              <div>
                <dt>Invoice</dt>
                <dd>{invoiceNumber}</dd>
              </div>
              <div>
                <dt>Sent</dt>
                <dd>{invoicedOn}</dd>
              </div>
            </dl>
          </>
        )}

        {state === 'awaiting' && (
          <p className="state state--wait">
            {invoiceNumber} sent {invoicedOn}. Awaiting payment.
          </p>
        )}

        {state === 'not-invoiced' &&
          (a.stage >= 4 ? (
            <>
              <p className="panel__hint">Your files are in. Send your invoice to get paid.</p>
              <button type="button" className="btn btn--primary">
                Send invoice
              </button>
            </>
          ) : (
            <p className="state state--idle">
              {PAYMENT_LABEL[state]} — available after the files are delivered.
            </p>
          ))}
      </section>
    </>
  );
}

function Time({ label, value }: { label: string; value: string }) {
  return (
    <div className="time">
      <span className="time__label">{label}</span>
      <span className="time__value">{value}</span>
    </div>
  );
}
