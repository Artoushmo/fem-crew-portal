'use client';

import { useMemo, useState } from 'react';
import { CRAFTS, CRAFT_LABEL } from '@/lib/profile-types';
import { STAGES } from '@/lib/assignments';
import { useClients } from '@/lib/use-clients';
import {
  BLANK_ROLE,
  JOB_STATUS_LABEL,
  formatEuro,
  jobProgress,
  jobStatus,
  useShoots,
  type Role,
  type RoleDraft,
  type Shoot,
  type ShootDraft,
} from '@/lib/use-staff-assignments';
import { avatarUrl } from '@/lib/use-profile';
import { BrandLoader } from '../BrandLoader';
import { ChevronIcon } from '../Icons';
import { Masthead } from '../Masthead';
import { CrewPicker } from './CrewPicker';
import { ShootForm } from './ShootForm';

type Filter = 'unbooked' | 'booked' | 'past';

const FILTER_LABEL: Record<Filter, string> = {
  unbooked: 'Needs crew',
  booked: 'Booked',
  past: 'Done',
};

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();

  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    // The year only earns its place when it is not this one.
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

function bucket(s: Shoot): Filter {
  if (new Date(s.starts_at) < new Date(new Date().toDateString())) return 'past';
  return s.roles.some((r) => !r.freelancer_id) ? 'unbooked' : 'booked';
}

export function StaffAssignmentsView() {
  const {
    shoots,
    loading,
    error,
    create,
    update,
    remove,
    addRole,
    removeRole,
    book,
    unbook,
    confirmPayment,
    undoPayment,
    setRoleStage,
    fileUrl,
  } = useShoots();
  const { clients, loading: clientsLoading } = useClients();

  const [filter, setFilter] = useState<Filter>('unbooked');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Shoot | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickingRole, setPickingRole] = useState<{ role: Role; shoot: Shoot } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<{ shootId: string; draft: RoleDraft } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { unbooked: 0, booked: 0, past: 0 };
    for (const s of shoots) c[bucket(s)] += 1;
    return c;
  }, [shoots]);

  const shown = useMemo(() => shoots.filter((s) => bucket(s) === filter), [shoots, filter]);

  const openRoles = useMemo(
    () => shoots.filter((s) => bucket(s) !== 'past').reduce(
      (n, s) => n + s.roles.filter((r) => !r.freelancer_id).length,
      0,
    ),
    [shoots],
  );

  const guard = async (fn: () => Promise<void>) => {
    setRowError(null);
    try {
      await fn();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'That did not work.');
    }
  };

  const save = async (draft: ShootDraft) => {
    if (editing) {
      await update(editing.id, draft);
      setEditing(null);
    } else {
      // Land on the shoot you just made, with its roles waiting to be filled.
      const id = await create(draft);
      setAdding(false);
      setFilter('unbooked');
      setOpenId(id);
    }
  };

  const busy = loading || clientsLoading;

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Assignments</h1>
        <p className="hero__sub">
          {openRoles === 0
            ? 'Every upcoming role is filled.'
            : `${openRoles} role${openRoles === 1 ? '' : 's'} still open`}
        </p>
      </Masthead>

      <main className="content content--table">
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}

        {busy ? (
          <BrandLoader label="Loading assignments" />
        ) : adding || editing ? (
          <ShootForm
            shoot={editing ?? undefined}
            clients={clients}
            onSave={save}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        ) : clients.length === 0 ? (
          <p className="state state--idle">Add a client first.</p>
        ) : (
          <>
            <div className="toolbar">
              <div className="segmented" role="tablist" aria-label="Which assignments">
                {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    className={`segmented__item ${filter === f ? 'is-on' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {FILTER_LABEL[f]}
                    <span className="segmented__count">{counts[f]}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  setEditing(null);
                  setAdding(true);
                }}
              >
                New assignment
              </button>
            </div>

            {rowError && (
              <p className="auth__error" role="alert">
                {rowError}
              </p>
            )}

            {shown.length === 0 ? (
              <p className="state state--idle">
                {filter === 'unbooked'
                  ? 'Nothing waiting for crew.'
                  : filter === 'booked'
                    ? 'Nothing fully booked.'
                    : 'Nothing finished yet.'}
              </p>
            ) : (
              <ul className="list">
                {shown.map((s) => {
                  const open = openId === s.id;
                  const fees = s.roles.reduce((n, r) => n + r.fee_cents, 0);

                  return (
                    <li key={s.id} className={`row ${open ? 'row--open' : ''}`}>
                      <button
                        type="button"
                        className="row__summary joblist__row"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : s.id)}
                      >
                        <span className="row__chevron" aria-hidden>
                          <ChevronIcon size={14} />
                        </span>

                        <span className="joblist__what">
                          <span className="joblist__title" title={s.title}>
                            {s.title}
                          </span>
                          <span className="joblist__ref">{s.reference ?? '—'}</span>
                        </span>

                        {/* The bar is the quick read and the number is the
                            precise one; a bar alone cannot tell 80 from 90. */}
                        <span className="joblist__progress">
                          <span className="meter" aria-hidden>
                            <span
                              className={`meter__fill meter__fill--${jobStatus(s)}`}
                              style={{ width: `${jobProgress(s)}%` }}
                            />
                          </span>
                          <span className="joblist__pct">{jobProgress(s)}%</span>
                        </span>

                        <span className={`pill pill--${jobStatus(s)}`}>
                          <span className="pill__dot" aria-hidden />
                          {JOB_STATUS_LABEL[jobStatus(s)]}
                        </span>

                        <span className="joblist__client">{s.client_name ?? '—'}</span>

                        <span className="joblist__when">
                          {dateLabel(s.starts_at)}
                          <span className="joblist__time">
                            {s.on_site && s.wrapped
                              ? `${s.on_site.slice(0, 5)}-${s.wrapped.slice(0, 5)}`
                              : 'Deadline'}
                          </span>
                        </span>

                        <span className="joblist__crew">
                          {s.roles.filter((r) => r.freelancer_id).length === 0 ? (
                            <span className="joblist__none">Nobody</span>
                          ) : (
                            s.roles
                              .filter((r) => r.freelancer_id)
                              .slice(0, 4)
                              .map((r) => {
                                const avatar = avatarUrl(r.freelancer_avatar);
                                const name = r.freelancer_name ?? '?';
                                return avatar ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={r.id}
                                    src={avatar}
                                    alt=""
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
                              })
                          )}
                          <span className="joblist__count">
                            {s.roles.filter((r) => r.freelancer_id).length}/{s.roles.length}
                          </span>
                        </span>

                        <span className="joblist__fee">{formatEuro(fees)}</span>
                      </button>

                      {open && (
                        <div className="shoot">
                          <ul className="roles">
                            {s.roles.map((r) => (
                              <li key={r.id} className="roles__row">
                                <span className="roles__craft">{CRAFT_LABEL[r.craft]}</span>
                                <span className="roles__label">
                                  {r.role_label === CRAFT_LABEL[r.craft] ? '' : r.role_label}
                                </span>

                                {r.freelancer_id ? (
                                  <span className="tag tag--ok">
                                    {r.freelancer_name ?? 'Booked'}
                                  </span>
                                ) : (
                                  <span className="tag tag--wait">Open</span>
                                )}

                                {/* Where this person is, and the two controls
                                    to move them. A producer who knows the files
                                    landed should not have to ask for a click. */}
                                {r.freelancer_id && (
                                  <span className="rolestep">
                                    <button
                                      type="button"
                                      className="rolestep__nudge"
                                      aria-label="Step back"
                                      disabled={r.stage <= 0}
                                      onClick={() => guard(() => setRoleStage(r.id, r.stage - 1))}
                                    >
                                      &minus;
                                    </button>
                                    <span className="rolestep__label">
                                      {r.stage + 1}/{STAGES.length} &middot;{' '}
                                      {STAGES[Math.min(r.stage, STAGES.length - 1)].short}
                                    </span>
                                    <button
                                      type="button"
                                      className="rolestep__nudge"
                                      aria-label="Move on a step"
                                      disabled={r.stage >= STAGES.length - 1}
                                      onClick={() => guard(() => setRoleStage(r.id, r.stage + 1))}
                                    >
                                      +
                                    </button>
                                  </span>
                                )}

                                {r.delivery_link && (
                                  <a
                                    href={r.delivery_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="link-arrow"
                                    title={r.delivery_note ?? undefined}
                                  >
                                    Delivery
                                  </a>
                                )}

                                {r.payment_state === 'awaiting' && (
                                  <button
                                    type="button"
                                    className="btn btn--outline btn--sm"
                                    onClick={() => guard(() => confirmPayment(r.id))}
                                  >
                                    Mark paid
                                  </button>
                                )}

                                {r.invoice_path && (
                                  <button
                                    type="button"
                                    className="link-arrow link-arrow--button"
                                    onClick={() =>
                                      guard(async () => {
                                        window.open(
                                          await fileUrl(r.invoice_path!),
                                          '_blank',
                                          'noopener',
                                        );
                                      })
                                    }
                                  >
                                    Invoice
                                  </button>
                                )}

                                {r.payment_state === 'paid' && (
                                  <>
                                    <span className="tag tag--ok">Paid</span>
                                    <button
                                      type="button"
                                      className="link-arrow link-arrow--button link-arrow--danger"
                                      onClick={() => guard(() => undoPayment(r.id))}
                                    >
                                      Undo
                                    </button>
                                  </>
                                )}

                                <span className="roles__fee">{formatEuro(r.fee_cents)}</span>

                                <span className="roles__controls">
                                  {r.freelancer_id ? (
                                    <button
                                      type="button"
                                      className="link-arrow link-arrow--button link-arrow--danger"
                                      onClick={() => guard(() => unbook(r.id))}
                                    >
                                      Unbook
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="link-arrow link-arrow--button"
                                        onClick={() => setPickingRole({ role: r, shoot: s })}
                                      >
                                        Find someone
                                      </button>
                                      <button
                                        type="button"
                                        className="link-arrow link-arrow--button link-arrow--danger"
                                        onClick={() => guard(() => removeRole(r.id))}
                                      >
                                        Drop role
                                      </button>
                                    </>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {pickingRole?.shoot.id === s.id && (
                            <CrewPicker
                              craft={pickingRole.role.craft}
                              city={s.city}
                              shootDate={s.starts_at}
                              onPick={async (freelancerId) => {
                                await book(pickingRole.role.id, freelancerId);
                                setPickingRole(null);
                              }}
                              onCancel={() => setPickingRole(null)}
                            />
                          )}

                          {newRole?.shootId === s.id ? (
                            <div className="rolelines__row rolelines__row--add">
                              <select
                                className="field__input"
                                aria-label="Craft for the new role"
                                value={newRole.draft.craft}
                                onChange={(e) => {
                                  const craft = e.target.value as RoleDraft['craft'];
                                  setNewRole({
                                    shootId: s.id,
                                    draft: {
                                      ...newRole.draft,
                                      craft,
                                      role_label:
                                        craft === '' ? '' : CRAFT_LABEL[craft],
                                    },
                                  });
                                }}
                              >
                                <option value="">Choose a craft</option>
                                {CRAFTS.map((c) => (
                                  <option key={c} value={c}>
                                    {CRAFT_LABEL[c]}
                                  </option>
                                ))}
                              </select>

                              <input
                                className="field__input"
                                aria-label="Call sheet label"
                                value={newRole.draft.role_label}
                                onChange={(e) =>
                                  setNewRole({
                                    shootId: s.id,
                                    draft: { ...newRole.draft, role_label: e.target.value },
                                  })
                                }
                                placeholder="On the call sheet"
                              />

                              <input
                                className="field__input"
                                aria-label="Fee"
                                value={newRole.draft.fee}
                                onChange={(e) =>
                                  setNewRole({
                                    shootId: s.id,
                                    draft: { ...newRole.draft, fee: e.target.value },
                                  })
                                }
                                placeholder="Fee"
                                inputMode="decimal"
                              />

                              <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                disabled={newRole.draft.craft === ''}
                                onClick={() =>
                                  guard(async () => {
                                    await addRole(s.id, newRole.draft);
                                    setNewRole(null);
                                  })
                                }
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                className="link-arrow link-arrow--button"
                                onClick={() => setNewRole(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="shoot__actions">
                              <button
                                type="button"
                                className="link-arrow link-arrow--button"
                                onClick={() =>
                                  setNewRole({ shootId: s.id, draft: { ...BLANK_ROLE } })
                                }
                              >
                                Add a role
                              </button>
                              <button
                                type="button"
                                className="link-arrow link-arrow--button"
                                onClick={() => {
                                  setAdding(false);
                                  setEditing(s);
                                }}
                              >
                                Edit shoot
                              </button>

                              {confirmId === s.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="link-arrow link-arrow--button link-arrow--danger"
                                    onClick={() =>
                                      guard(async () => {
                                        setConfirmId(null);
                                        await remove(s.id);
                                      })
                                    }
                                  >
                                    Yes, delete the shoot
                                  </button>
                                  <button
                                    type="button"
                                    className="link-arrow link-arrow--button"
                                    onClick={() => setConfirmId(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="link-arrow link-arrow--button link-arrow--danger"
                                  onClick={() => setConfirmId(s.id)}
                                >
                                  Delete
                                </button>
                              )}
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
