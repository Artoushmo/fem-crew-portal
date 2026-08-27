'use client';

import { useState } from 'react';
import { CRAFTS, CRAFT_LABEL } from '@/lib/profile-types';
import type { Client } from '@/lib/use-clients';
import {
  BLANK_ASSIGNMENT,
  type AssignmentDraft,
  type StaffAssignment,
} from '@/lib/use-staff-assignments';
import { Field } from '../profile/SectionForm';

/** Turns a saved row back into something the form can edit. */
export function toDraft(a: StaffAssignment): AssignmentDraft {
  return {
    title: a.title,
    client_id: a.client_id ?? '',
    required_craft: a.required_craft ?? '',
    role: a.role,
    date: a.starts_at.slice(0, 10),
    on_site: a.on_site.slice(0, 5),
    camera_ready: a.camera_ready.slice(0, 5),
    wrapped: a.wrapped.slice(0, 5),
    city: a.city,
    venue: a.venue,
    maps_url: a.maps_url ?? '',
    travel: a.travel ?? '',
    parking: a.parking ?? '',
    fee: a.fee_cents === 0 ? '' : (a.fee_cents / 100).toString().replace('.', ','),
    briefing: a.briefing ?? '',
    dresscode: a.dresscode ?? '',
    client_notes: a.client_notes ?? '',
  };
}

export function AssignmentForm({
  assignment,
  clients,
  onSave,
  onCancel,
}: {
  assignment?: StaffAssignment;
  clients: Client[];
  onSave: (draft: AssignmentDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AssignmentDraft>(
    assignment ? toDraft(assignment) : BLANK_ASSIGNMENT,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    (key: keyof AssignmentDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  // Everything below this is on a call sheet. Without them there is nothing to
  // send a freelancer, so the button stays shut rather than saving a shell.
  const ready =
    form.title.trim() !== '' &&
    form.client_id !== '' &&
    form.date !== '' &&
    form.city.trim() !== '' &&
    form.venue.trim() !== '' &&
    form.role.trim() !== '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this assignment.');
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="panel__title">{assignment ? 'Edit assignment' : 'New assignment'}</h2>
      <p className="panel__hint">
        Saved without crew. You pick a freelancer and offer it as a separate step, so
        nothing goes out before you have read it back.
      </p>

      <p className="eyebrow eyebrow--spaced">The job</p>
      <div className="form-grid">
        <Field label="Title">
          <input
            className="field__input"
            value={form.title}
            onChange={set('title')}
            placeholder="Product Launch"
            autoFocus
            required
          />
        </Field>

        <Field label="Client">
          <select className="field__input" value={form.client_id} onChange={set('client_id')} required>
            <option value="">Choose a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Craft" hint="What we match on.">
          <select className="field__input" value={form.required_craft} onChange={set('required_craft')}>
            <option value="">Any</option>
            {CRAFTS.map((c) => (
              <option key={c} value={c}>
                {CRAFT_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Role on the day" hint="What it says on the call sheet.">
          <input
            className="field__input"
            value={form.role}
            onChange={set('role')}
            placeholder="Photographer"
            required
          />
        </Field>
      </div>

      <p className="eyebrow eyebrow--spaced">When</p>
      <div className="form-grid form-grid--four">
        <Field label="Date">
          <input type="date" className="field__input" value={form.date} onChange={set('date')} required />
        </Field>
        <Field label="On site">
          <input type="time" className="field__input" value={form.on_site} onChange={set('on_site')} required />
        </Field>
        <Field label="Camera ready">
          <input
            type="time"
            className="field__input"
            value={form.camera_ready}
            onChange={set('camera_ready')}
            required
          />
        </Field>
        <Field label="Wrapped">
          <input type="time" className="field__input" value={form.wrapped} onChange={set('wrapped')} required />
        </Field>
      </div>

      <p className="eyebrow eyebrow--spaced">Where</p>
      <div className="form-grid">
        <Field label="City">
          <input className="field__input" value={form.city} onChange={set('city')} placeholder="Amsterdam" required />
        </Field>
        <Field label="Venue">
          <input
            className="field__input"
            value={form.venue}
            onChange={set('venue')}
            placeholder="RAI Convention Centre"
            required
          />
        </Field>
        <Field label="Maps link" hint="Opens on their phone on the day.">
          <input className="field__input" value={form.maps_url} onChange={set('maps_url')} placeholder="https://" />
        </Field>
        <Field label="Travel">
          <input
            className="field__input"
            value={form.travel}
            onChange={set('travel')}
            placeholder="Metro 52 to Europaplein"
          />
        </Field>
        <Field label="Parking">
          <input
            className="field__input"
            value={form.parking}
            onChange={set('parking')}
            placeholder="P1, reimbursed"
          />
        </Field>
        <Field label="Fee" hint="Euros. Excluding VAT.">
          <input className="field__input" value={form.fee} onChange={set('fee')} placeholder="450" inputMode="decimal" />
        </Field>
      </div>

      <p className="eyebrow eyebrow--spaced">Briefing</p>
      <Field label="What the shoot is" hint="The freelancer reads this before accepting.">
        <textarea
          className="field__input field__input--area"
          rows={4}
          value={form.briefing}
          onChange={set('briefing')}
        />
      </Field>

      <div className="form-grid">
        <Field label="Dress code">
          <input
            className="field__input"
            value={form.dresscode}
            onChange={set('dresscode')}
            placeholder="Smart casual, dark colours"
          />
        </Field>
        <Field label="Client notes" hint="House rules, access, anything from the client.">
          <input className="field__input" value={form.client_notes} onChange={set('client_notes')} />
        </Field>
      </div>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      <div className="panel__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !ready}>
          {busy ? 'Saving...' : assignment ? 'Save changes' : 'Create assignment'}
        </button>
        <button type="button" className="btn btn--outline btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
