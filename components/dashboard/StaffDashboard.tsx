'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { CRAFT_LABEL } from '@/lib/profile-types';
import { avatarUrl } from '@/lib/use-profile';
import { formatEuro, KIND_LABEL } from '@/lib/use-staff-assignments';
import { daysFrom, jobName, useStaffDashboard, whenLabel } from '@/lib/use-staff-dashboard';
import { BrandLoader } from '../BrandLoader';
import { Masthead } from '../Masthead';

function firstName(full: string | null | undefined): string {
  return full?.trim().split(' ')[0] ?? 'there';
}

export function StaffDashboard() {
  const { profile } = useAuth();
  const { loading, error, tasks, upcoming, money, crewHealth, clients, openRoles } =
    useStaffDashboard();

  const now = tasks.filter((t) => t.urgency === 'now');
  const soon = tasks.filter((t) => t.urgency === 'soon');

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Hi, {firstName(profile?.full_name)}</h1>
        <p className="hero__sub">
          {loading
            ? 'Looking things over.'
            : tasks.length === 0
              ? 'Nothing needs you right now.'
              : `${tasks.length} thing${tasks.length === 1 ? '' : 's'} need your attention.`}
        </p>
      </Masthead>

      <main className="content content--wide">
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <BrandLoader label="Loading your week" />
        ) : (
          <>
            {/* --- What needs doing ------------------------------------- */}

            <p className="eyebrow">Needs you</p>

            {tasks.length === 0 ? (
              <p className="state state--ok">
                Every upcoming role is filled, everyone has accepted, and nothing is waiting
                to be paid.
              </p>
            ) : (
              <ul className="list list--tight">
                {[...now, ...soon].slice(0, 8).map((t) => (
                  <li key={t.id} className="row">
                    <Link href="/assignments" className="task">
                      <span
                        className={`task__dot task__dot--${t.urgency}`}
                        aria-label={t.urgency === 'now' ? 'Urgent' : 'Soon'}
                      />
                      <span className="task__what">
                        <span className="task__title">{t.what}</span>
                        <span className="task__where">
                          {t.where} &middot; {t.when}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {tasks.length > 8 && (
              <p className="field__hint field__hint--block">
                And {tasks.length - 8} more, further out.
              </p>
            )}

            {/* --- Money ------------------------------------------------- */}

            <p className="eyebrow eyebrow--spaced">Money</p>
            <div className="tiles">
              <Tile
                label="Committed"
                value={formatEuro(money.committed)}
                note="Booked fees, all jobs"
              />
              <Tile
                label="To be invoiced"
                value={formatEuro(money.awaitingInvoice)}
                note="Delivered, no invoice yet"
                tone={money.awaitingInvoice > 0 ? 'wait' : undefined}
              />
              <Tile
                label="To pay"
                value={formatEuro(money.awaitingPayment)}
                note="Invoice received"
                tone={money.awaitingPayment > 0 ? 'warn' : undefined}
              />
              <Tile label="Paid" value={formatEuro(money.paid)} note="Settled" />
            </div>

            {/* --- The next two weeks ------------------------------------ */}

            <p className="eyebrow eyebrow--spaced">Next two weeks</p>

            {upcoming.length === 0 ? (
              <p className="state state--idle">Nothing on the calendar for the next fortnight.</p>
            ) : (
              <ul className="list list--tight">
                {upcoming.map((s) => {
                  const days = daysFrom(s.starts_at);
                  const filled = s.roles.filter((r) => r.freelancer_id);

                  return (
                    <li key={s.id} className="row">
                      <div className="agenda">
                        <div className="agenda__when">
                          <span className="agenda__day">
                            {new Date(s.starts_at).toLocaleDateString('en-GB', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                          <span className="agenda__rel">{whenLabel(days)}</span>
                        </div>

                        <div className="agenda__what">
                          <span className="job__title">{jobName(s)}</span>
                          <span className="job__meta">
                            {s.kind === 'shoot'
                              ? [s.on_site?.slice(0, 5), s.venue, s.city]
                                  .filter(Boolean)
                                  .join(' · ')
                              : `${KIND_LABEL[s.kind]} · deadline`}
                          </span>
                        </div>

                        <div className="agenda__crew">
                          {filled.length === 0 ? (
                            <span className="tag tag--warn">Nobody booked</span>
                          ) : (
                            <>
                              {filled.slice(0, 4).map((r) => {
                                const avatar = avatarUrl(r.freelancer_avatar);
                                const name = r.freelancer_name ?? '?';
                                return avatar ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={r.id}
                                    src={avatar}
                                    alt={name}
                                    title={`${name} - ${CRAFT_LABEL[r.craft]}`}
                                    className="agenda__face"
                                  />
                                ) : (
                                  <span
                                    key={r.id}
                                    className="agenda__face agenda__face--initials"
                                    title={`${name} - ${CRAFT_LABEL[r.craft]}`}
                                  >
                                    {name.slice(0, 2).toUpperCase()}
                                  </span>
                                );
                              })}
                              {s.roles.length > filled.length && (
                                <span className="tag tag--wait">
                                  {s.roles.length - filled.length} open
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* --- The books --------------------------------------------- */}

            <p className="eyebrow eyebrow--spaced">The books</p>
            <div className="tiles">
              <Tile
                label="Open roles"
                value={String(openRoles)}
                note={openRoles === 0 ? 'All filled' : 'Still to book'}
                tone={openRoles > 0 ? 'wait' : undefined}
                href="/assignments"
              />
              <Tile
                label="Crew"
                value={String(crewHealth.total)}
                note="Active freelancers"
                href="/team"
              />
              <Tile
                label="Clients"
                value={String(clients.length)}
                note="On the books"
                href="/clients"
              />
              <Tile
                label="Unmatchable"
                value={String(crewHealth.unmatchable.length)}
                note="No craft listed"
                tone={crewHealth.unmatchable.length > 0 ? 'warn' : undefined}
                href="/team"
              />
            </div>

            {crewHealth.unmatchable.length > 0 && (
              <p className="state state--wait">
                {crewHealth.unmatchable
                  .map((m) => m.full_name ?? m.email ?? 'Someone')
                  .join(', ')}{' '}
                {crewHealth.unmatchable.length === 1 ? 'has' : 'have'} no craft on their profile,
                so they never turn up when you look for crew. Ask them to fill in Work.
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
  href,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'wait' | 'warn';
  href?: string;
}) {
  const body = (
    <>
      <span className="tile__label">{label}</span>
      <span className={`tile__value ${tone ? `tile__value--${tone}` : ''}`}>{value}</span>
      <span className="tile__note">{note}</span>
    </>
  );

  return href ? (
    <Link href={href} className="tile tile--link">
      {body}
    </Link>
  ) : (
    <div className="tile">{body}</div>
  );
}
