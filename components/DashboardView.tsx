'use client';

import Link from 'next/link';
import { useActionQueue, useAssignments } from '@/lib/assignment-state';
import { useAuth } from '@/lib/auth';
import { formatFee, freelancer } from '@/lib/assignments';
import { AddToCalendar } from './AddToCalendar';
import { Countdown } from './Countdown';
import { CalendarIcon, CameraIcon, ChevronIcon, FeeIcon, LocationIcon } from './Icons';
import { Masthead } from './Masthead';
import { StatusPill } from './StatusPill';

export function DashboardView() {
  const assignments = useAssignments();
  const queue = useActionQueue();
  const { profile, session, configured } = useAuth();

  // Greet the signed-in person, not the seed data. Falls back to the sample
  // name only when there is no account to read — i.e. the unauthenticated demo.
  const firstName = configured
    ? (profile?.full_name?.trim().split(/\s+/)[0] ??
      session?.user?.email?.split('@')[0] ??
      'there')
    : freelancer.firstName;

  const scheduled = assignments
    .filter((a) => a.stage < 3)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const job = scheduled[0] ?? assignments[0];
  const later = scheduled.slice(1);
  const bookedFees = scheduled.reduce((sum, a) => sum + a.fee, 0);
  const toInvoice = assignments
    .filter((a) => a.stage === 5)
    .reduce((sum, a) => sum + a.fee, 0);
  const awaiting = assignments
    .filter((a) => a.payment.state === 'awaiting')
    .reduce((sum, a) => sum + a.fee, 0);

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Hi, {firstName}</h1>
        <p className="hero__sub">
          {queue.length > 0
            ? `${queue.length} thing${queue.length > 1 ? 's' : ''} need your attention.`
            : 'Nothing needs your attention. Nice.'}
        </p>
      </Masthead>

      <main className="content content--wide">
        {queue.length > 0 && (
          <section className="block">
            <p className="eyebrow">Needs you</p>
            <ul className="queue">
              {queue.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className={`todo todo--${item.tone}`}>
                    <span className="todo__mark" aria-hidden />
                    <span className="todo__body">
                      <span className="todo__label">{item.label}</span>
                      <span className="todo__detail">{item.detail}</span>
                    </span>
                    <span className="todo__chevron" aria-hidden>
                      <ChevronIcon />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {scheduled.length > 0 && (
          <section className="block">
            <div className="block__head">
              <p className="eyebrow">Next assignment</p>
              <Countdown startsAt={job.startsAt} />
            </div>

            <article className="card">
              <div className="card__head">
                <div>
                  <h2 className="card__title">{job.title}</h2>
                  <p className="card__client">{job.client}</p>
                </div>
                <StatusPill status={job.status} />
              </div>

              <div className="facts">
                <div className="fact">
                  <CalendarIcon />
                  <div>
                    <div className="fact__value">{job.dateLabel}</div>
                    <div className="fact__note">
                      On site {job.onSite} · {job.cameraReady}–{job.wrapped}
                    </div>
                  </div>
                </div>

                <div className="fact">
                  <LocationIcon />
                  <div>
                    <div className="fact__value">
                      {job.city}, {job.venue}
                    </div>
                    <a
                      className="fact__link"
                      href={job.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in Maps →
                    </a>
                  </div>
                </div>

                <div className="fact">
                  <CameraIcon />
                  <div>
                    <div className="fact__value">{job.role}</div>
                    <div className="fact__note">{job.contact.name} is your producer</div>
                  </div>
                </div>

                <div className="fact">
                  <FeeIcon />
                  <div>
                    <div className="fact__value fact__value--money">{formatFee(job.fee)}</div>
                    <div className="fact__note">Agreed fee</div>
                  </div>
                </div>
              </div>

              <Link href={`/assignments/${job.id}`} className="next-action">
                <span className="next-action__group">
                  <span className="dot" />
                  <span className="next-action__label">Next action</span>
                  <span className="next-action__value">{job.nextAction}</span>
                </span>
                <span className="next-action__chevron">
                  <ChevronIcon />
                </span>
              </Link>

              <div className="card__actions">
                <Link href={`/assignments/${job.id}`} className="btn btn--primary">
                  View Assignment
                </Link>
                {job.stage >= 2 && <AddToCalendar assignment={job} />}
              </div>
            </article>
          </section>
        )}

        {later.length > 0 && (
          <section className="block">
            <div className="block__head">
              <p className="eyebrow">After that</p>
              <Link href="/assignments" className="link-arrow">
                All assignments →
              </Link>
            </div>

            <ul className="list">
              {later.map((a) => (
                <li key={a.id} className="row">
                  <Link href={`/assignments/${a.id}`} className="upnext">
                    <span className="upnext__date">
                      <span className="upnext__month">
                        {new Date(a.startsAt).toLocaleDateString('en-GB', { month: 'short' })}
                      </span>
                      <span className="upnext__day">{new Date(a.startsAt).getDate()}</span>
                    </span>
                    <span className="upnext__body">
                      <span className="row__title">{a.title}</span>
                      <span className="row__client">
                        {a.client} · {a.role} · on site {a.onSite}
                      </span>
                    </span>
                    <span className="upnext__fee">{formatFee(a.fee)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="block">
          <div className="block__head">
            <p className="eyebrow">Money</p>
            <Link href="/payments" className="link-arrow">
              Payments →
            </Link>
          </div>

          <div className="tiles tiles--three">
            <div className="tile">
              <span className="tile__label">Booked ahead</span>
              <span className="tile__value">{formatFee(bookedFees)}</span>
              <span className="tile__note">
                {scheduled.length} assignment{scheduled.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="tile tile--act">
              <span className="tile__label">Ready to invoice</span>
              <span className="tile__value">{formatFee(toInvoice)}</span>
              <span className="tile__note">Files delivered</span>
            </div>
            <div className="tile tile--wait">
              <span className="tile__label">Awaiting payment</span>
              <span className="tile__value">{formatFee(awaiting)}</span>
              <span className="tile__note">Invoices sent</span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
