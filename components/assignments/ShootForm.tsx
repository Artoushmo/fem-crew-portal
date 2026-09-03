'use client';

import { useState } from 'react';
import { CRAFTS, CRAFT_LABEL } from '@/lib/profile-types';
import type { Client } from '@/lib/use-clients';
import {
  BLANK_ROLE,
  BLANK_SHOOT,
  centsToInput,
  fromLines,
  type RoleDraft,
  type Shoot,
  type ShootDraft,
} from '@/lib/use-staff-assignments';
import { Field } from '../profile/SectionForm';

export function toDraft(s: Shoot): ShootDraft {
  return {
    title: s.title,
    client_id: s.client_id ?? '',
    hasShootDay: Boolean(s.on_site && s.venue),
    hasDeadline: Boolean(s.due_on),
    date: s.starts_at.slice(0, 10),
    due_on: s.due_on ?? '',
    on_site: s.on_site?.slice(0, 5) ?? '12:30',
    camera_ready: s.camera_ready?.slice(0, 5) ?? '13:00',
    wrapped: s.wrapped?.slice(0, 5) ?? '18:00',
    city: s.city ?? '',
    venue: s.venue ?? '',
    maps_url: s.maps_url ?? '',
    travel: s.travel ?? '',
    parking: s.parking ?? '',
    briefing: s.briefing ?? '',
    expectations: fromLines(s.expectations),
    shots: fromLines(s.shots),
    equipment: fromLines(s.equipment),
    dresscode: s.dresscode ?? '',
    client_notes: s.client_notes ?? '',
    gallery_link: s.gallery_link ?? '',
    gallery_note: s.gallery_note ?? '',
    delivery: s.delivery,
    // Roles are edited on the shoot itself, where you can also see who is on
    // them. Editing them here would mean two places to book from.
    roles: s.roles.map((r) => ({
      craft: r.craft,
      role_label: r.role_label,
      fee: centsToInput(r.fee_cents),
    })),
  };
}

export function ShootForm({
  shoot,
  clients,
  onSave,
  onCancel,
}: {
  shoot?: Shoot;
  clients: Client[];
  onSave: (draft: ShootDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = shoot !== undefined;
  const [form, setForm] = useState<ShootDraft>(shoot ? toDraft(shoot) : BLANK_SHOOT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    (key: keyof ShootDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const setDelivery =
    (key: keyof ShootDraft['delivery']) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, delivery: { ...f.delivery, [key]: e.target.value } }));

  const setRole = (i: number, patch: Partial<RoleDraft>) =>
    setForm((f) => ({
      ...f,
      roles: f.roles.map((r, n) => (n === i ? { ...r, ...patch } : r)),
    }));

  const addRole = () => setForm((f) => ({ ...f, roles: [...f.roles, { ...BLANK_ROLE }] }));

  const dropRole = (i: number) =>
    setForm((f) => ({ ...f, roles: f.roles.filter((_, n) => n !== i) }));

  const { hasShootDay, hasDeadline } = form;

  // Enough to put on a call sheet, or enough to hold a deadline, or both. A job
  // with neither cannot be scheduled or chased, so the button stays shut.
  const ready =
    form.title.trim() !== '' &&
    form.client_id !== '' &&
    (hasShootDay || hasDeadline) &&
    (!hasShootDay || (form.date !== '' && form.venue.trim() !== '')) &&
    (!hasDeadline || form.due_on !== '') &&
    (editing || form.roles.some((r) => r.craft !== ''));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this job.');
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="panel__title">{editing ? 'Edit assignment' : 'New assignment'}</h2>
      <p className="panel__hint">
        Everything here is shared by everyone on it. Who fills each role is decided on the
        job itself, so nobody is offered anything before you have read it back.
      </p>

      <p className="eyebrow eyebrow--spaced">What this job involves</p>
      <p className="field__hint field__hint--block">
        Not a choice between two kinds of work. A launch can be a shoot day and a website,
        so tick whatever applies.
      </p>

      <div className="toggles">
        <label className="toggle">
          <input
            type="checkbox"
            checked={hasShootDay}
            onChange={(e) => setForm((f) => ({ ...f, hasShootDay: e.target.checked }))}
          />
          <span>
            <b>A shoot day</b>
            Call times and a venue.
          </span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={hasDeadline}
            onChange={(e) => setForm((f) => ({ ...f, hasDeadline: e.target.checked }))}
          />
          <span>
            <b>A deadline</b>
            Work delivered by a date &mdash; a web build, an app design, an edit.
          </span>
        </label>
      </div>

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
      </div>

      {!editing && (
        <>
          <p className="eyebrow eyebrow--spaced">Who you need</p>
          <p className="field__hint field__hint--block">
            One line per person. A launch with a photographer, a videographer and a drone
            operator is one assignment with three roles, not three assignments. Fees are
            <strong> excluding VAT</strong> &mdash; the freelancer adds it on their invoice.
          </p>

          <ul className="rolelines">
            {form.roles.map((r, i) => (
              <li key={i} className="rolelines__row">
                <select
                  className="field__input"
                  value={r.craft}
                  aria-label={`Craft for role ${i + 1}`}
                  onChange={(e) => {
                    const craft = e.target.value as RoleDraft['craft'];
                    setRole(i, {
                      craft,
                      // The label follows the craft until someone types over it.
                      role_label:
                        r.role_label === '' && craft !== '' ? CRAFT_LABEL[craft] : r.role_label,
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
                  value={r.role_label}
                  aria-label={`Call sheet label for role ${i + 1}`}
                  onChange={(e) => setRole(i, { role_label: e.target.value })}
                  placeholder="On the call sheet"
                />

                <input
                  className="field__input"
                  value={r.fee}
                  aria-label={`Fee excluding VAT for role ${i + 1}`}
                  onChange={(e) => setRole(i, { fee: e.target.value })}
                  placeholder="Fee ex. VAT"
                  inputMode="decimal"
                />

                <button
                  type="button"
                  className="link-arrow link-arrow--button link-arrow--danger"
                  onClick={() => dropRole(i)}
                  disabled={form.roles.length === 1}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <button type="button" className="btn btn--outline btn--sm" onClick={addRole}>
            Add a role
          </button>
        </>
      )}

      {hasShootDay && (
        <>
          <p className="eyebrow eyebrow--spaced">The shoot day</p>
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
        </>
      )}

      {hasDeadline && (
        <>
          <p className="eyebrow eyebrow--spaced">Deadline</p>
          <div className="form-grid">
            <Field label="Delivered by" hint="What the work is measured against.">
              <input type="date" className="field__input" value={form.due_on} onChange={set('due_on')} required />
            </Field>
          </div>
        </>
      )}

      {hasShootDay && (
        <>
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
            <Field label="Parking">
              <input className="field__input" value={form.parking} onChange={set('parking')} placeholder="P1, reimbursed" />
            </Field>
            <Field label="Dress code">
              <input
                className="field__input"
                value={form.dresscode}
                onChange={set('dresscode')}
                placeholder="Smart casual, dark colours"
              />
            </Field>
          </div>
        </>
      )}

      <p className="eyebrow eyebrow--spaced">Briefing</p>
      <Field label="What the shoot is" hint="Read before anyone accepts.">
        <textarea className="field__input field__input--area" rows={4} value={form.briefing} onChange={set('briefing')} />
      </Field>

      <div className="form-grid">
        <Field label="What we expect" hint="One per line.">
          <textarea
            className="field__input field__input--area"
            rows={4}
            value={form.expectations}
            onChange={set('expectations')}
            placeholder={'Arrive 30 min early\nCheck in with the producer'}
          />
        </Field>
        <Field label={hasShootDay ? 'Shot list' : 'Deliverables'} hint="One per line.">
          <textarea
            className="field__input field__input--area"
            rows={4}
            value={form.shots}
            onChange={set('shots')}
            placeholder={
              hasShootDay
                ? 'Keynote wide\nAudience reactions\nProduct close-ups'
                : 'Homepage\nProduct page\nContact form'
            }
          />
        </Field>
        <Field label={hasShootDay ? 'Bring' : 'Tools and access'} hint="One per line.">
          <textarea
            className="field__input field__input--area"
            rows={4}
            value={form.equipment}
            onChange={set('equipment')}
            placeholder={
              hasShootDay
                ? 'Two bodies\n24-70 and 70-200\nSpare batteries'
                : 'Figma file\nStaging access\nBrand kit'
            }
          />
        </Field>
        <Field label="Client notes" hint="House rules, access, anything from the client.">
          <textarea
            className="field__input field__input--area"
            rows={4}
            value={form.client_notes}
            onChange={set('client_notes')}
          />
        </Field>
      </div>

      <p className="eyebrow eyebrow--spaced">Delivery</p>
      <div className="form-grid">
        <Field label="First selection">
          <input
            className="field__input"
            value={form.delivery.firstSelection}
            onChange={setDelivery('firstSelection')}
            placeholder="Within 48 hours"
          />
        </Field>
        <Field label="Full edit">
          <input
            className="field__input"
            value={form.delivery.fullEdit}
            onChange={setDelivery('fullEdit')}
            placeholder="Within 10 working days"
          />
        </Field>
        <Field label="Format" hint="One per line.">
          <textarea
            className="field__input field__input--area"
            rows={4}
            value={form.delivery.format}
            onChange={setDelivery('format')}
            placeholder={'JPEG, sRGB, full resolution\nWeb exports at 2048px long edge\nFilenames: FEM_client_date_001'}
          />
        </Field>
        <Field
          label="Gallery link"
          hint="A Pixieset or similar gallery we already made. Set this and delivery means adding to it."
        >
          <input
            className="field__input"
            value={form.gallery_link}
            onChange={set('gallery_link')}
            placeholder="https://..."
          />
        </Field>

        <Field label="How to add to it" hint="Login, folder, naming - whatever they need.">
          <input
            className="field__input"
            value={form.gallery_note}
            onChange={set('gallery_note')}
            placeholder="Upload into the Selects folder"
          />
        </Field>

        <Field label="Retention">
          <input
            className="field__input"
            value={form.delivery.retention}
            onChange={setDelivery('retention')}
            placeholder="Keep the raws for 90 days"
          />
        </Field>
      </div>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      <div className="panel__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !ready}>
          {busy ? 'Saving...' : editing ? 'Save changes' : 'Create assignment'}
        </button>
        <button type="button" className="btn btn--outline btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
