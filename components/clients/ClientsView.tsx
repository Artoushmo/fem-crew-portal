'use client';

import { useMemo, useState } from 'react';
import { useClients, type Client, type ClientDraft } from '@/lib/use-clients';
import { BrandLoader } from '../BrandLoader';
import { Masthead } from '../Masthead';
import { ClientForm } from './ClientForm';

export function ClientsView() {
  const { clients, loading, error, canManage, create, update, remove } = useClients();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.city, c.contact_name, c.contact_email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [clients, query]);

  const save = async (draft: ClientDraft, id?: string) => {
    if (id) await update(id, draft);
    else await create(draft);
    setAdding(false);
    setEditingId(null);
  };

  const drop = async (client: Client) => {
    setRowError(null);
    setConfirmId(null);
    try {
      await remove(client.id);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not remove that client.');
    }
  };

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Clients</h1>
        <p className="hero__sub">
          {clients.length === 0
            ? 'Nobody on the books yet.'
            : `${clients.length} on the books`}
        </p>
      </Masthead>

      <main className="content content--wide">
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <BrandLoader label="Loading clients" />
        ) : (
          <>
            {adding ? (
              <ClientForm onSave={(d) => save(d)} onCancel={() => setAdding(false)} />
            ) : (
              canManage && (
                <div className="toolbar">
                  <label className="sr-only" htmlFor="client-search">
                    Search clients
                  </label>
                  <input
                    id="client-search"
                    className="field__input toolbar__search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, city or contact"
                  />
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      setEditingId(null);
                      setAdding(true);
                    }}
                  >
                    New client
                  </button>
                </div>
              )
            )}

            {rowError && (
              <p className="auth__error" role="alert">
                {rowError}
              </p>
            )}

            {shown.length === 0 ? (
              <p className="state state--idle">
                {clients.length === 0
                  ? 'No clients yet. Add the first one to book an assignment against it.'
                  : 'Nothing matches that search.'}
              </p>
            ) : (
              <ul className="list">
                {shown.map((c) =>
                  editingId === c.id ? (
                    <li key={c.id}>
                      <ClientForm
                        client={c}
                        onSave={(d) => save(d, c.id)}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  ) : (
                    <li key={c.id} className="row">
                      <div className="client">
                        <div className="client__who">
                          <span className="client__name">{c.name}</span>
                          <span className="client__where">
                            {[c.city, c.address].filter(Boolean).join(' · ') || 'No address'}
                          </span>
                        </div>

                        <div className="client__contact">
                          {c.contact_name && <span>{c.contact_name}</span>}
                          {c.contact_email && (
                            <a href={`mailto:${c.contact_email}`} className="client__link">
                              {c.contact_email}
                            </a>
                          )}
                          {c.contact_phone && (
                            <a href={`tel:${c.contact_phone}`} className="client__link">
                              {c.contact_phone}
                            </a>
                          )}
                        </div>

                        {canManage && (
                          <div className="client__controls">
                            <button
                              type="button"
                              className="link-arrow link-arrow--button"
                              onClick={() => {
                                setAdding(false);
                                setConfirmId(null);
                                setEditingId(c.id);
                              }}
                            >
                              Edit
                            </button>

                            {confirmId === c.id ? (
                              <>
                                <button
                                  type="button"
                                  className="link-arrow link-arrow--button link-arrow--danger"
                                  onClick={() => drop(c)}
                                >
                                  Yes, remove
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
                                  setConfirmId(c.id);
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {c.notes && <p className="client__notes">{c.notes}</p>}
                    </li>
                  ),
                )}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
