'use client';

import { useState } from 'react';
import { requireSupabase } from '@/lib/supabase';
import {
  CREDENTIAL_KINDS,
  CREDENTIAL_LABEL,
  type CredentialKind,
  type CredentialRow,
  type ProfileRow,
} from '@/lib/profile-types';

const BLANK = {
  kind: 'drone-licence' as CredentialKind,
  label: '',
  reference: '',
  expires_on: '',
};

/** Days until a date, or null when there is no date. */
function daysLeft(date: string | null) {
  if (!date) return null;
  const day = 24 * 60 * 60 * 1000;
  const then = new Date(date);
  const now = new Date();
  return Math.round(
    (Date.UTC(then.getFullYear(), then.getMonth(), then.getDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      day,
  );
}

export function CredentialsSection({
  profile,
  credentials,
  onSaved,
}: {
  profile: ProfileRow | null;
  credentials: CredentialRow[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !draft.label.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const { error: insertError } = await requireSupabase().from('credentials').insert({
        profile_id: profile.id,
        kind: draft.kind,
        label: draft.label.trim(),
        reference: draft.reference.trim() || null,
        expires_on: draft.expires_on || null,
      });
      if (insertError) throw new Error(insertError.message);
      setDraft(BLANK);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    const { error: deleteError } = await requireSupabase()
      .from('credentials')
      .delete()
      .eq('id', id);
    if (deleteError) setError(deleteError.message);
    else onSaved();
  };

  return (
    <section className="panel">
      <h2 className="panel__title">Licences and insurance</h2>
      <p className="panel__hint">
        Drone work and most venues need proof. An expired certificate can cost you the
        booking on the day, so the dates are tracked here.
      </p>

      {credentials.length === 0 ? (
        <p className="state state--idle">Nothing on file.</p>
      ) : (
        <ul className="creds">
          {credentials.map((c) => {
            const left = daysLeft(c.expires_on);
            const state =
              left === null ? 'none' : left < 0 ? 'expired' : left <= 60 ? 'soon' : 'valid';

            return (
              <li key={c.id} className="cred">
                <div className="cred__main">
                  <span className="cred__kind">{CREDENTIAL_LABEL[c.kind]}</span>
                  <span className="cred__label">{c.label}</span>
                  {c.reference && <span className="cred__ref">{c.reference}</span>}
                </div>

                <div className="cred__side">
                  {c.expires_on && (
                    <span className={`cred__expiry cred__expiry--${state}`}>
                      {state === 'expired'
                        ? `Expired ${new Date(c.expires_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : `Valid to ${new Date(c.expires_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </span>
                  )}
                  <button
                    type="button"
                    className="link-arrow link-arrow--button link-arrow--danger"
                    onClick={() => remove(c.id)}
                    aria-label={`Remove ${c.label}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className="kit__add" onSubmit={add}>
        <label className="field field--inline">
          <span className="field__label">Type</span>
          <select
            className="field__input"
            value={draft.kind}
            onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as CredentialKind }))}
          >
            {CREDENTIAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {CREDENTIAL_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--inline field--grow">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="EU A2 remote pilot"
            required
          />
        </label>

        <label className="field field--inline">
          <span className="field__label">Reference</span>
          <input
            className="field__input"
            value={draft.reference}
            onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value }))}
            placeholder="NLD-A2-…"
          />
        </label>

        <label className="field field--inline">
          <span className="field__label">Expires</span>
          <input
            type="date"
            className="field__input"
            value={draft.expires_on}
            onChange={(e) => setDraft((d) => ({ ...d, expires_on: e.target.value }))}
          />
        </label>

        <button
          type="submit"
          className="btn btn--primary btn--sm kit__submit"
          disabled={busy || !draft.label.trim()}
        >
          Add
        </button>
      </form>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
