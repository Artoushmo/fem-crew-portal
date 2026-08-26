'use client';

import { useState } from 'react';
import type { AppRole } from '@/lib/auth';
import { ROLES, ROLE_LABEL, ROLE_NOTE } from '@/lib/use-team';
import { Field } from '../profile/SectionForm';

const BLANK = { email: '', full_name: '', role: 'freelancer' as AppRole };

export function InviteForm({
  onInvite,
}: {
  onInvite: (input: { email: string; full_name: string; role: AppRole }) => Promise<void>;
}) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      await onInvite(form);
      setAdded(form.email.trim().toLowerCase());
      setForm(BLANK);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add them.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="panel__title">Add someone</h2>
      <p className="panel__hint">
        Creates the account straight away. They sign in with a code sent to this address —
        there is no password and no invitation link to chase.
      </p>

      <div className="invite">
        <Field label="Email">
          <input
            type="email"
            className="field__input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="naam@fastelevatemedia.com"
            required
          />
        </Field>

        <Field label="Name">
          <input
            className="field__input"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            placeholder="Sanne de Vries"
          />
        </Field>

        <Field label="Role">
          <select
            className="field__input"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AppRole }))}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="field__hint">{ROLE_NOTE[form.role]}</p>

      {form.role !== 'freelancer' && (
        <p className="state state--wait">
          Two-factor is mandatory for this role. Tell them to link an authenticator the
          first time they sign in, or the portal will look empty to them.
        </p>
      )}

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      {added && (
        <p className="state state--ok" role="status">
          {added} can sign in now.
        </p>
      )}

      <div className="panel__actions">
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={busy || !form.email.includes('@')}
        >
          {busy ? 'Adding…' : 'Add member'}
        </button>
      </div>
    </form>
  );
}
