'use client';

import type { RoleDraft } from '@/lib/use-staff-assignments';
import { Field } from '../profile/SectionForm';

/** What differs for one person on a job.
 *
 * Empty means "the same as the job" rather than "nothing", so this is only ever
 * filled in where a role departs from the rest of the crew. Shared between
 * creating a job and editing a role on one, because a producer should not find
 * two different versions of the same form. */
export function RoleDetails({
  role,
  onChange,
}: {
  role: RoleDraft;
  onChange: (patch: Partial<RoleDraft>) => void;
}) {
  const setDelivery = (key: keyof RoleDraft['delivery']) => (value: string) =>
    onChange({ delivery: { ...role.delivery, [key]: value } });

  return (
    <div className="rolelines__own">
      <p className="field__hint field__hint--block">Leave empty to follow the job.</p>

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
        <textarea
          className="field__input field__input--area"
          rows={3}
          value={role.briefing}
          onChange={(e) => onChange({ briefing: e.target.value })}
        />
      </Field>

      <div className="form-grid">
        <Field label="What we expect" hint="One per line.">
          <textarea
            className="field__input field__input--area"
            rows={3}
            value={role.expectations}
            onChange={(e) => onChange({ expectations: e.target.value })}
          />
        </Field>
        <Field label="Shot list or deliverables" hint="One per line.">
          <textarea
            className="field__input field__input--area"
            rows={3}
            value={role.shots}
            onChange={(e) => onChange({ shots: e.target.value })}
          />
        </Field>
        <Field label="Must-have equipment" hint="One per line.">
          <textarea
            className="field__input field__input--area"
            rows={3}
            value={role.equipment}
            onChange={(e) => onChange({ equipment: e.target.value })}
          />
        </Field>
      </div>

      <div className="form-grid">
        <Field label="First selection">
          <input
            className="field__input"
            value={role.delivery.firstSelection}
            onChange={(e) => setDelivery('firstSelection')(e.target.value)}
          />
        </Field>
        <Field label="Full edit">
          <input
            className="field__input"
            value={role.delivery.fullEdit}
            onChange={(e) => setDelivery('fullEdit')(e.target.value)}
          />
        </Field>
        <Field label="Format">
          <input
            className="field__input"
            value={role.delivery.format}
            onChange={(e) => setDelivery('format')(e.target.value)}
          />
        </Field>
        <Field label="Save originals for">
          <input
            className="field__input"
            value={role.delivery.retention}
            onChange={(e) => setDelivery('retention')(e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
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
