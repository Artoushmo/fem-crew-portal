'use client';

import { useMemo, useState } from 'react';
import { CRAFTS, CRAFT_LABEL } from '@/lib/profile-types';
import { useClients } from '@/lib/use-clients';
import {
  BLANK_ROLE,
  formatEuro,
  useShoots,
  type Role,
  type RoleDraft,
  type Shoot,
  type ShootDraft,
} from '@/lib/use-staff-assignments';
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
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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
    attachContract,
    removeContract,
    confirmPayment,
    contractUrl,
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
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

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

      <main className="content content--wide">
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
          <p className="state state--idle">Add a client first. A shoot has to belong to one.</p>
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
                New shoot
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
                    ? 'Nothing fully booked yet.'
                    : 'Nothing behind us yet.'}
              </p>
            ) : (
              <ul className="list">
                {shown.map((s) => {
                  const open = openId === s.id;
                  const filled = s.roles.filter((r) => r.freelancer_id).length;
                  const total = s.roles.length;
                  const fees = s.roles.reduce((n, r) => n + r.fee_cents, 0);

                  return (
                    <li key={s.id} className={`row ${open ? 'row--open' : ''}`}>
                      <button
                        type="button"
                        className="row__summary"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : s.id)}
                      >
                        <span className="row__chevron" aria-hidden>
                          <ChevronIcon size={14} />
                        </span>

                        <span className="job">
                          <span className="job__when">
                            <span className="job__date">{dateLabel(s.starts_at)}</span>
                            <span className="job__time">
                              {s.kind === 'shoot' && s.on_site && s.wrapped
                                ? `${s.on_site.slice(0, 5)}-${s.wrapped.slice(0, 5)}`
                                : 'Deadline'}
                            </span>
                          </span>

                          <span className="job__what">
                            <span className="job__title">{s.title}</span>
                            <span className="job__meta">
                              {[s.client_name, s.city, s.venue].filter(Boolean).join(' · ')}
                            </span>
                          </span>

                          <span className="job__who">
                            <span className={filled === total ? 'tag tag--ok' : 'tag tag--wait'}>
                              {filled} of {total} booked
                            </span>
                            <span className="job__fee">{formatEuro(fees)}</span>
                          </span>
                        </span>
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

                                {r.contract_signed_on && (
                                  <span className="tag tag--ok">
                                    {r.signed_copy_name ? 'Signed copy' : 'Signed'}
                                  </span>
                                )}

                                {r.signed_copy_path && (
                                  <button
                                    type="button"
                                    className="link-arrow link-arrow--button"
                                    onClick={() =>
                                      guard(async () => {
                                        window.open(
                                          await contractUrl(r.signed_copy_path!),
                                          '_blank',
                                          'noopener',
                                        );
                                      })
                                    }
                                  >
                                    Open signed
                                  </button>
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

                                {r.payment_state === 'paid' && (
                                  <span className="tag tag--ok">Paid</span>
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

                          {/* The client's own paperwork, when there is any.
                              Attached here rather than in the form, because it
                              often arrives after the job has been written up. */}
                          <div className="contract">
                            {s.contract_path ? (
                              <>
                                <span className="contract__name">
                                  {s.contract_name ?? 'Contract'}
                                </span>
                                <button
                                  type="button"
                                  className="link-arrow link-arrow--button"
                                  onClick={() =>
                                    guard(async () => {
                                      window.open(
                                        await contractUrl(s.contract_path!),
                                        '_blank',
                                        'noopener',
                                      );
                                    })
                                  }
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  className="link-arrow link-arrow--button link-arrow--danger"
                                  onClick={() => guard(() => removeContract(s.id))}
                                >
                                  Detach
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="contract__name contract__name--none">
                                  No contract for this job
                                </span>
                                <label
                                  className={`link-arrow link-arrow--button ${
                                    uploadingFor === s.id ? 'is-busy' : ''
                                  }`}
                                >
                                  {uploadingFor === s.id ? 'Uploading...' : 'Attach a contract'}
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      e.target.value = '';
                                      if (!file) return;
                                      setUploadingFor(s.id);
                                      guard(async () => {
                                        try {
                                          await attachContract(s.id, file);
                                        } finally {
                                          setUploadingFor(null);
                                        }
                                      });
                                    }}
                                  />
                                </label>
                              </>
                            )}
                          </div>

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
