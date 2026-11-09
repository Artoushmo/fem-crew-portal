'use client';

import { useState } from 'react';
import { CRAFTS, CRAFT_LABEL } from '@/lib/profile-types';
import type { Client } from '@/lib/use-clients';
import {
  BLANK_DAY,
  BLANK_ROLE,
  BLANK_SHOOT,
  centsToInput,
  fromLines,
  type DayDraft,
  type RoleDraft,
  type Shoot,
  type ShootDraft,
} from '@/lib/use-staff-assignments';
import { Field } from '../profile/SectionForm';
import { RoleDetails, inheritedFrom, roleHasOwn } from './RoleDetails';


/** A saved role back into something the form can edit. Empty strings where the
    role follows the job, which is what the form shows as "same as the job". */
/** `dayDates` maps day ids to dates, because the form keys a person's days by
    date -- a day being added has no id yet. */
export function roleToDraft(
  r: Shoot['roles'][number],
  dayDates: Map<string, string> = new Map(),
): RoleDraft {
  return {
    craft: r.craft,
    role_label: r.role_label,
    fee: centsToInput(r.fee_cents),
    is_lead: r.is_lead,
    days: Object.fromEntries(
      (r.days ?? []).map((d) => [
        dayDates.get(d.day_id) ?? d.day_id,
        { present: d.present, on_site: d.on_site?.slice(0, 5) ?? '', wrapped: d.wrapped?.slice(0, 5) ?? '' },
      ]),
    ),
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
  const dayDates = new Map(s.days.map((d) => [d.id, d.day]));
  // Stored days inherit the job's times where they say nothing; the form
  // shows every day filled in, so a producer reads hours rather than blanks.
  const days: DayDraft[] =
    s.days.length > 0
      ? s.days.map((d) => ({
          day: d.day,
          on_site: (d.on_site ?? s.on_site)?.slice(0, 5) ?? '09:00',
          camera_ready: (d.camera_ready ?? s.camera_ready)?.slice(0, 5) ?? '09:00',
          wrapped: (d.wrapped ?? s.wrapped)?.slice(0, 5) ?? '17:00',
          note: d.note ?? '',
        }))
      : [
          {
            day: s.starts_at.slice(0, 10),
            on_site: s.on_site?.slice(0, 5) ?? '12:30',
            camera_ready: s.camera_ready?.slice(0, 5) ?? '13:00',
            wrapped: s.wrapped?.slice(0, 5) ?? '18:00',
            note: '',
          },
        ];

  return {
    title: s.title,
    client_id: s.client_id ?? '',
    hasShootDay: Boolean(s.on_site && s.venue),
    hasDeadline: Boolean(s.due_on),
    days,
    due_on: s.due_on ?? '',
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
    gallery_link: s.gallery_link ?? '',
    gallery_note: s.gallery_note ?? '',
    delivery: s.delivery,
    // Roles are edited on the job itself, where you can also see who is on
    // them. Editing them here would mean two places to book from.
    roles: s.roles.map((r) => roleToDraft(r, dayDates)),
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

  const setDay = (i: number, patch: Partial<DayDraft>) =>
    setForm((f) => ({ ...f, days: f.days.map((d, n) => (n === i ? { ...d, ...patch } : d)) }));

  // The next day, same hours. Two-day conferences keep the same call time;
  // the one that differs is edited after.
  const addDay = () =>
    setForm((f) => {
      const last = f.days[f.days.length - 1] ?? BLANK_DAY;
      let day = '';
      if (last.day) {
        const d = new Date(`${last.day}T12:00:00`);
        d.setDate(d.getDate() + 1);
        day = d.toISOString().slice(0, 10);
      }
      return { ...f, days: [...f.days, { ...last, day, note: '' }] };
    });

  const dropDay = (i: number) =>
    setForm((f) => ({ ...f, days: f.days.filter((_, n) => n !== i) }));

  const dropRole = (i: number) =>
    setForm((f) => ({ ...f, roles: f.roles.filter((_, n) => n !== i) }));

  const { hasShootDay, hasDeadline } = form;

  // Enough to put on a call sheet, or enough to hold a deadline, or both. A job
  // with neither cannot be scheduled or chased, so the button stays shut.
  const ready =
    form.title.trim() !== '' &&
    form.client_id !== '' &&
    (hasShootDay || hasDeadline) &&
    (!hasShootDay || (form.days.some((d) => d.day !== '') && form.venue.trim() !== '')) &&
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

      {editing && (
        <p className="field__hint field__hint--block">
          Roles and fees are set per person: open <strong>Details</strong> on the role in the list.
        </p>
      )}

      {!editing && (
        <>
          <p className="eyebrow eyebrow--spaced">Who you need</p>
          <p className="field__hint field__hint--block">
            One line per person. Two photographers are two lines, each with its own label.
            Fees <strong>excluding VAT</strong>.
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

                {/* One per job. Ticking a second one moves it. */}
                <label className="rolelines__lead" title="Point of contact on site">
                  <input
                    type="checkbox"
                    checked={r.is_lead}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        roles: f.roles.map((x, n) => ({
                          ...x,
                          is_lead: n === i ? e.target.checked : false,
                        })),
                      }))
                    }
                  />
                  Lead
                </label>

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
                  <RoleDetails
                    role={r}
                    inherited={inheritedFrom(form)}
                    days={form.days}
                    onChange={(patch) => setRole(i, patch)}
                  />
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
          <p className="eyebrow eyebrow--spaced">
            {form.days.length > 1 ? 'The shoot days' : 'The shoot day'}
          </p>
          <ul className="daylines">
            {form.days.map((d, i) => (
              <li key={i} className="daylines__row">
                <input
                  type="date"
                  className="field__input"
                  value={d.day}
                  aria-label={`Date, day ${i + 1}`}
                  onChange={(e) => setDay(i, { day: e.target.value })}
                  required
                />
                <input
                  type="time"
                  className="field__input"
                  value={d.on_site}
                  aria-label={`On site, day ${i + 1}`}
                  title="On site"
                  onChange={(e) => setDay(i, { on_site: e.target.value })}
                  required
                />
                <input
                  type="time"
                  className="field__input"
                  value={d.camera_ready}
                  aria-label={`Camera ready, day ${i + 1}`}
                  title="Camera ready"
                  onChange={(e) => setDay(i, { camera_ready: e.target.value })}
                  required
                />
                <input
                  type="time"
                  className="field__input"
                  value={d.wrapped}
                  aria-label={`Wrapped, day ${i + 1}`}
                  title="Wrapped"
                  onChange={(e) => setDay(i, { wrapped: e.target.value })}
                  required
                />
                <input
                  className="field__input"
                  value={d.note}
                  aria-label={`Note, day ${i + 1}`}
                  placeholder={form.days.length > 1 ? 'Build day, Conference' : 'Note'}
                  onChange={(e) => setDay(i, { note: e.target.value })}
                />
                <button
                  type="button"
                  className="link-arrow link-arrow--button link-arrow--danger"
                  onClick={() => dropDay(i)}
                  disabled={form.days.length === 1}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p className="field__hint field__hint--block daylines__legend">
            Date \u00b7 on site \u00b7 camera ready \u00b7 wrapped. Everyone is on every day unless their role says otherwise.
          </p>
          <button type="button" className="btn btn--outline btn--sm" onClick={addDay}>
            Add a day
          </button>
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
