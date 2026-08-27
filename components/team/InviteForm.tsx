'use client';

import { useState } from 'react';
import type { AppRole } from '@/lib/auth';
import { ROLES, ROLE_LABEL, ROLE_NOTE } from '@/lib/use-team';
import { Field } from '../profile/SectionForm';

const BLANK = { email: '', full_name: '', role: 'freelancer' as AppRole };

export function InviteForm({
  onInvite,
}: {
  onInvite: (input: { email: string; full_name: string; role: AppRole }) => Promise<{
    mailed: boolean;
    mailNote: string | null;
  }>;
}) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ email: string; mailed: boolean; note: string | null } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const result = await onInvite(form);
      setAdded({
        email: form.email.trim().toLowerCase(),
        mailed: result.mailed,
        note: result.mailNote,
      });
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
        Creates the account straight away and emails them a welcome with the portal link.
        They sign in with a code sent to this address — there is no password to set.
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
        <p className={added.mailed ? 'state state--ok' : 'state state--wait'} role="status">
          {added.mailed
            ? `${added.email} can sign in now — a welcome email is on its way.`
            : `${added.email} can sign in now. ${added.note}`}
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
