'use client';

import type { Delivery, RoleDraft } from '@/lib/use-staff-assignments';
import { Field } from '../profile/SectionForm';

/** The job's own text, as a role starts out with it. */
export interface Inherited {
  briefing: string;
  expectations: string;
  shots: string;
  equipment: string;
  delivery: Delivery;
}

/** What differs for one person on a job.
 *
 * Stored empty means "the same as the job", and that is what a producer sees
 * here: the job's text, ready to be changed for this person. Typing over it
 * makes it theirs; putting it back word for word makes it the job's again, so
 * a later edit to the job still reaches them. Shared between creating a job
 * and editing a role on one, because a producer should not find two different
 * versions of the same form. */
export function RoleDetails({
  role,
  inherited,
  onChange,
}: {
  role: RoleDraft;
  inherited: Inherited;
  onChange: (patch: Partial<RoleDraft>) => void;
}) {
  // What is shown: the role's own if set, otherwise the job's.
  const shown = (key: 'briefing' | 'expectations' | 'shots' | 'equipment') =>
    role[key] !== '' ? role[key] : inherited[key];

  // What is stored: empty when it matches the job, so inheritance survives.
  const store = (key: 'briefing' | 'expectations' | 'shots' | 'equipment') => (value: string) =>
    onChange({ [key]: value.trim() === inherited[key].trim() ? '' : value });

  const own = (key: 'briefing' | 'expectations' | 'shots' | 'equipment') => role[key] !== '';

  const shownDelivery = (key: keyof Delivery) =>
    role.delivery[key] !== '' ? role.delivery[key] : inherited.delivery[key];

  const setDelivery = (key: keyof Delivery) => (value: string) =>
    onChange({
      delivery: {
        ...role.delivery,
        [key]: value.trim() === inherited.delivery[key].trim() ? '' : value,
      },
    });

  const Own = ({ when }: { when: boolean }) =>
    when ? <span className="roles__own roles__own--inline">Own</span> : null;

  return (
    <div className="rolelines__own">
      <p className="field__hint field__hint--block">
        Starts as the job. Change what is different for this person.
      </p>

      <div className="form-grid form-grid--four">
        <Field label="On site">
          <input
            type="time"
            className="field__input"
            value={role.on_site}
            onChange={(e) => onChange({ on_site: e.target.value })}
          />
        </Field>
        <Field label="Camera ready">
          <input
            type="time"
            className="field__input"
            value={role.camera_ready}
            onChange={(e) => onChange({ camera_ready: e.target.value })}
          />
        </Field>
        <Field label="Wrapped">
          <input
            type="time"
            className="field__input"
            value={role.wrapped}
            onChange={(e) => onChange({ wrapped: e.target.value })}
          />
        </Field>
        <Field label="Deadline" hint="Their own, if it differs.">
          <input
            type="date"
            className="field__input"
            value={role.due_on}
            onChange={(e) => onChange({ due_on: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Briefing">
        <Own when={own('briefing')} />
        <textarea
          className={`field__input field__input--area ${own('briefing') ? 'is-own' : ''}`}
          rows={4}
          value={shown('briefing')}
          onChange={(e) => store('briefing')(e.target.value)}
        />
      </Field>

      <div className="form-grid">
        <Field label="What we expect" hint="One per line.">
          <Own when={own('expectations')} />
          <textarea
            className={`field__input field__input--area ${own('expectations') ? 'is-own' : ''}`}
            rows={3}
            value={shown('expectations')}
            onChange={(e) => store('expectations')(e.target.value)}
          />
        </Field>
        <Field label="Shot list or deliverables" hint="One per line.">
          <Own when={own('shots')} />
          <textarea
            className={`field__input field__input--area ${own('shots') ? 'is-own' : ''}`}
            rows={3}
            value={shown('shots')}
            onChange={(e) => store('shots')(e.target.value)}
          />
        </Field>
        <Field label="Must-have equipment" hint="One per line.">
          <Own when={own('equipment')} />
          <textarea
            className={`field__input field__input--area ${own('equipment') ? 'is-own' : ''}`}
            rows={3}
            value={shown('equipment')}
            onChange={(e) => store('equipment')(e.target.value)}
          />
        </Field>
      </div>

      <div className="form-grid">
        <Field label="First selection">
          <input
            className={`field__input ${role.delivery.firstSelection ? 'is-own' : ''}`}
            value={shownDelivery('firstSelection')}
            onChange={(e) => setDelivery('firstSelection')(e.target.value)}
          />
        </Field>
        <Field label="Full edit">
          <input
            className={`field__input ${role.delivery.fullEdit ? 'is-own' : ''}`}
            value={shownDelivery('fullEdit')}
            onChange={(e) => setDelivery('fullEdit')(e.target.value)}
          />
        </Field>
        <Field label="Format">
          <input
            className={`field__input ${role.delivery.format ? 'is-own' : ''}`}
            value={shownDelivery('format')}
            onChange={(e) => setDelivery('format')(e.target.value)}
          />
        </Field>
        <Field label="Save originals for">
          <input
            className={`field__input ${role.delivery.retention ? 'is-own' : ''}`}
            value={shownDelivery('retention')}
            onChange={(e) => setDelivery('retention')(e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

/** The job's text in the shape the role form compares against. From the
    draft while writing a job, from the saved shoot while editing a role. */
export function inheritedFrom(src: {
  briefing: string;
  expectations: string;
  shots: string;
  equipment: string;
  delivery: Delivery;
}): Inherited {
  return {
    briefing: src.briefing,
    expectations: src.expectations,
    shots: src.shots,
    equipment: src.equipment,
    delivery: src.delivery,
  };
}

/** Whether anything was set for this person rather than the whole crew. Drives
    the label, so a producer sees at a glance which roles depart from the job. */
export function roleHasOwn(r: RoleDraft): boolean {
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
