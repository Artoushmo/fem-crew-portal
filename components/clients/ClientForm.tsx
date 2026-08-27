'use client';

import { useState } from 'react';
import { BLANK_CLIENT, type Client, type ClientDraft } from '@/lib/use-clients';
import { Field } from '../profile/SectionForm';

function toDraft(client: Client): ClientDraft {
  const { id: _id, created_at: _created, ...rest } = client;
  return rest;
}

export function ClientForm({
  client,
  onSave,
  onCancel,
}: {
  /** Absent when adding. Present when editing, and then the form opens filled. */
  client?: Client;
  onSave: (draft: ClientDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ClientDraft>(client ? toDraft(client) : BLANK_CLIENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof ClientDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this client.');
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="panel__title">{client ? 'Edit client' : 'New client'}</h2>
      <p className="panel__hint">
        Only the name is required. The rest is what a producer needs on the day, and what
        ends up on the call sheet.
      </p>

      <div className="form-grid">
        <Field label="Client">
          <input
            className="field__input"
            value={form.name}
            onChange={set('name')}
            placeholder="Northwind"
            autoFocus
            required
          />
        </Field>

        <Field label="City">
          <input
            className="field__input"
            value={form.city ?? ''}
            onChange={set('city')}
            placeholder="Amsterdam"
          />
        </Field>

        <Field label="Contact" hint="Who FEM speaks to.">
          <input
            className="field__input"
            value={form.contact_name ?? ''}
            onChange={set('contact_name')}
            placeholder="Sanne de Vries"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            className="field__input"
            value={form.contact_email ?? ''}
            onChange={set('contact_email')}
            placeholder="sanne@northwind.nl"
          />
        </Field>

        <Field label="Phone">
          <input
            className="field__input"
            value={form.contact_phone ?? ''}
            onChange={set('contact_phone')}
            placeholder="+31 6 12 34 56 78"
          />
        </Field>

        <Field label="Address">
          <input
            className="field__input"
            value={form.address ?? ''}
            onChange={set('address')}
            placeholder="Europaplein 24"
          />
        </Field>
      </div>

      <Field label="Notes" hint="Access, parking, house rules. Anything that repeats every shoot.">
        <textarea
          className="field__input field__input--area"
          rows={3}
          value={form.notes ?? ''}
          onChange={set('notes')}
        />
      </Field>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      <div className="panel__actions">
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={busy || form.name.trim() === ''}
        >
          {busy ? 'Saving...' : client ? 'Save changes' : 'Add client'}
        </button>
        <button type="button" className="btn btn--outline btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
