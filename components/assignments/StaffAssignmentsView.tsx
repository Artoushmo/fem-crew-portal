'use client';

import { useMemo, useState } from 'react';
import { CRAFT_LABEL } from '@/lib/profile-types';
import { useClients } from '@/lib/use-clients';
import {
  formatEuro,
  useStaffAssignments,
  type AssignmentDraft,
  type StaffAssignment,
} from '@/lib/use-staff-assignments';
import { BrandLoader } from '../BrandLoader';
import { Masthead } from '../Masthead';
import { AssignmentForm } from './AssignmentForm';

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

/** Which bucket a row belongs in, in the order a producer thinks about them:
    what still needs someone, what is covered, and what is behind us. */
function bucket(a: StaffAssignment): Filter {
  if (new Date(a.starts_at) < new Date(new Date().toDateString())) return 'past';
  return a.freelancer_id ? 'booked' : 'unbooked';
}

export function StaffAssignmentsView() {
  const { assignments, loading, error, create, update, remove } = useStaffAssignments();
  const { clients, loading: clientsLoading } = useClients();

  const [filter, setFilter] = useState<Filter>('unbooked');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffAssignment | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { unbooked: 0, booked: 0, past: 0 };
    for (const a of assignments) c[bucket(a)] += 1;
    return c;
  }, [assignments]);

  const shown = useMemo(
    () => assignments.filter((a) => bucket(a) === filter),
    [assignments, filter],
  );

  const save = async (draft: AssignmentDraft) => {
    if (editing) await update(editing.id, draft);
    else await create(draft);
    setAdding(false);
    setEditing(null);
  };

  const drop = async (a: StaffAssignment) => {
    setConfirmId(null);
    setRowError(null);
    try {
      await remove(a.id);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not remove that assignment.');
    }
  };

  const busy = loading || clientsLoading;

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Assignments</h1>
        <p className="hero__sub">
          {counts.unbooked === 0
            ? 'Everything upcoming has crew.'
            : `${counts.unbooked} still need${counts.unbooked === 1 ? 's' : ''} crew`}
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
          <AssignmentForm
            assignment={editing ?? undefined}
            clients={clients}
            onSave={save}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        ) : clients.length === 0 ? (
          <p className="state state--idle">
            Add a client first. An assignment has to belong to one.
          </p>
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
                    ? 'Nothing booked yet.'
                    : 'Nothing behind us yet.'}
              </p>
            ) : (
              <ul className="list">
                {shown.map((a) => (
                  <li key={a.id} className="row">
                    <div className="job">
                      <div className="job__when">
                        <span className="job__date">{dateLabel(a.starts_at)}</span>
                        <span className="job__time">
                          {a.on_site.slice(0, 5)}&ndash;{a.wrapped.slice(0, 5)}
                        </span>
                      </div>

                      <div className="job__what">
                        <span className="job__title">{a.title}</span>
                        <span className="job__meta">
                          {[a.client_name, a.city, a.venue].filter(Boolean).join(' · ')}
                        </span>
                      </div>

                      <div className="job__who">
                        {a.freelancer_name ? (
                          <span className="tag tag--ok">{a.freelancer_name}</span>
                        ) : (
                          <span className="tag tag--wait">
                            {a.required_craft ? CRAFT_LABEL[a.required_craft] : 'Crew'} wanted
                          </span>
                        )}
                        <span className="job__fee">{formatEuro(a.fee_cents)}</span>
                      </div>

                      <div className="job__controls">
                        <button
                          type="button"
                          className="link-arrow link-arrow--button"
                          onClick={() => {
                            setAdding(false);
                            setConfirmId(null);
                            setEditing(a);
                          }}
                        >
                          Edit
                        </button>

                        {confirmId === a.id ? (
                          <>
                            <button
                              type="button"
                              className="link-arrow link-arrow--button link-arrow--danger"
                              onClick={() => drop(a)}
                            >
                              Yes, delete
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
                            onClick={() => {
                              setRowError(null);
                              setConfirmId(a.id);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
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
