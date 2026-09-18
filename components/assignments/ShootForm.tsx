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

/** Whether anything was set for this person rather than the whole crew. Drives
    the label, so a producer can see at a glance which roles differ. */
function roleHasOwn(r: RoleDraft): boolean {
  return Boolean(
    r.on_site ||
      r.camera_ready ||
      r.wrapped ||
      r.due_on ||
      r.briefing.trim() ||
      r.expectations.trim() ||
      r.shots.trim() ||
      r.equipment.trim() ||
      Object.values(r.delivery).some((v) => v.trim()),
  );
}

/** A saved role back into something the form can edit. Empty strings where the
    role follows the job, which is what the form shows as "same as the job". */
export function roleToDraft(r: Shoot['roles'][number]): RoleDraft {
  return {
    craft: r.craft,
    role_label: r.role_label,
    fee: centsToInput(r.fee_cents),
    on_site: r.on_site?.slice(0, 5) ?? '',
    camera_ready: r.camera_ready?.slice(0, 5) ?? '',
    wrapped: r.wrapped?.slice(0, 5) ?? '',
    due_on: r.due_on ?? '',
    briefing: r.briefing ?? '',
    expectations: fromLines(r.expectations),
    shots: fromLines(r.shots),
    equipment: fromLines(r.equipment),
    delivery: {
      firstSelection: r.delivery?.firstSelection ?? '',
      fullEdit: r.delivery?.fullEdit ?? '',
      format: r.delivery?.format ?? '',
      retention: r.delivery?.retention ?? '',
    },
  };
}

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
    // Roles are edited on the job itself, where you can also see who is on
    // them. Editing them here would mean two places to book from.
    roles: s.roles.map((r) => roleToDraft(r)),
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
  // Which role has its own details open. Closed by default, because most roles
  // follow the job and an always-open panel makes the exception look like the
  // rule.
  const [openRole, setOpenRole] = useState<number | null>(null);

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
      <p className="panel__hint">Shared by everyone on the job. Crew is booked afterwards.</p>

      <p className="eyebrow eyebrow--spaced">What this job involves</p>
      <p className="field__hint field__hint--block">Tick whatever applies. Both is fine.</p>

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
            Web, app, edit.
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
            One line per person. Fees <strong>excluding VAT</strong>.
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
                  className="link-arrow link-arrow--button"
                  onClick={() => setOpenRole(openRole === i ? null : i)}
                >
                  {roleHasOwn(r) ? 'Own details' : 'Details'}
                </button>

                <button
                  type="button"
                  className="link-arrow link-arrow--button link-arrow--danger"
                  onClick={() => dropRole(i)}
                  disabled={form.roles.length === 1}
                >
                  Remove
                </button>

                {openRole === i && (
                  <div className="rolelines__own">
                    <p className="field__hint field__hint--block">
                      Leave empty to follow the job.
                    </p>

                    <div className="form-grid form-grid--four">
                      <Field label="On site">
                        <input
                          type="time"
                          className="field__input"
                          value={r.on_site}
                          onChange={(e) => setRole(i, { on_site: e.target.value })}
                        />
                      </Field>
                      <Field label="Camera ready">
                        <input
                          type="time"
                          className="field__input"
                          value={r.camera_ready}
                          onChange={(e) => setRole(i, { camera_ready: e.target.value })}
                        />
                      </Field>
                      <Field label="Wrapped">
                        <input
                          type="time"
                          className="field__input"
                          value={r.wrapped}
                          onChange={(e) => setRole(i, { wrapped: e.target.value })}
                        />
                      </Field>
                      <Field label="Deadline" hint="Their own, if it differs.">
                        <input
                          type="date"
                          className="field__input"
                          value={r.due_on}
                          onChange={(e) => setRole(i, { due_on: e.target.value })}
                        />
                      </Field>
                    </div>

                    <Field label="Briefing">
                      <textarea
                        className="field__input field__input--area"
                        rows={3}
                        value={r.briefing}
                        onChange={(e) => setRole(i, { briefing: e.target.value })}
                      />
                    </Field>

                    <div className="form-grid">
                      <Field label="What we expect" hint="One per line.">
                        <textarea
                          className="field__input field__input--area"
                          rows={3}
                          value={r.expectations}
                          onChange={(e) => setRole(i, { expectations: e.target.value })}
                        />
                      </Field>
                      <Field label="Shot list or deliverables" hint="One per line.">
                        <textarea
                          className="field__input field__input--area"
                          rows={3}
                          value={r.shots}
                          onChange={(e) => setRole(i, { shots: e.target.value })}
                        />
                      </Field>
                      <Field label="Must-have equipment" hint="One per line.">
                        <textarea
                          className="field__input field__input--area"
                          rows={3}
                          value={r.equipment}
                          onChange={(e) => setRole(i, { equipment: e.target.value })}
                        />
                      </Field>
                    </div>

                    <div className="form-grid">
                      <Field label="First selection">
                        <input
                          className="field__input"
                          value={r.delivery.firstSelection}
                          onChange={(e) =>
                            setRole(i, {
                              delivery: { ...r.delivery, firstSelection: e.target.value },
                            })
                          }
                        />
                      </Field>
                      <Field label="Full edit">
                        <input
                          className="field__input"
                          value={r.delivery.fullEdit}
                          onChange={(e) =>
                            setRole(i, { delivery: { ...r.delivery, fullEdit: e.target.value } })
                          }
                        />
                      </Field>
                      <Field label="Format">
                        <input
                          className="field__input"
                          value={r.delivery.format}
                          onChange={(e) =>
                            setRole(i, { delivery: { ...r.delivery, format: e.target.value } })
                          }
                        />
                      </Field>
                      <Field label="Save originals for">
                        <input
                          className="field__input"
                          value={r.delivery.retention}
                          onChange={(e) =>
                            setRole(i, { delivery: { ...r.delivery, retention: e.target.value } })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}
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
            <Field label="Delivered by">
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
            <Field label="Maps link">
              <input className="field__input" value={form.maps_url} onChange={set('maps_url')} placeholder="https://" />
            </Field>
            <Field label="Parking" hint="A note, or a maps link.">
              <input
                className="field__input"
                value={form.parking}
                onChange={set('parking')}
                placeholder="P1, reimbursed — or https://maps.app.goo.gl/..."
              />
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
      <Field label="What the job is">
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
        <Field
          label={hasShootDay ? 'Must-have equipment' : 'Tools and access'}
          hint="One per line."
        >
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
        <Field label="Client notes" hint="Access, house rules.">
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
        <Field label="Gallery link" hint="Pixieset or similar. Crew delivers into it.">
          <input
            className="field__input"
            value={form.gallery_link}
            onChange={set('gallery_link')}
            placeholder="https://..."
          />
        </Field>

        <Field label="Save originals for">
          <input
            className="field__input"
            value={form.delivery.retention}
            onChange={setDelivery('retention')}
            placeholder="90 days"
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
