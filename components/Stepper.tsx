import { STAGES } from '@/lib/assignments';
import { CheckIcon } from './Icons';

/** Horizontal seven-stage tracker: contract → … → paid.
    Scrolls sideways on narrow screens rather than cramming. */
export function Stepper({
  stage,
  dates,
  complete = false,
  waitingUntil,
}: {
  stage: number;
  dates: (string | null)[];
  /** When the whole assignment is finished, the last stage reads done, not current. */
  complete?: boolean;
  /** Set when the current step cannot be taken yet -- a shoot day is not
      something you do early. "Now" under a step that is months away contradicts
      the panel right below it, which is where people notice. */
  waitingUntil?: string | null;
}) {
  const reached = complete ? STAGES.length : stage;
  const pct = (Math.min(reached, STAGES.length - 1) / (STAGES.length - 1)) * 100;

  return (
    <div className="stepper">
      <div className="stepper__head">
        <p className="stepper__label">Your progress</p>
        <p className="stepper__count">
          {complete ? STAGES.length : stage + 1} of {STAGES.length} ·{' '}
          <strong>{complete ? 'Finished' : STAGES[stage].label}</strong>
        </p>
      </div>

      <div className="stepper__scroll">
        <ol className="stepper__track" style={{ ['--fill' as string]: `${pct}%` }}>
          {STAGES.map((s, i) => {
            const state = i < reached ? 'done' : i === reached ? 'current' : 'upcoming';
            return (
              <li key={s.key} className={`stp stp--${state}`}>
                <span className="stp__dot" aria-hidden>
                  {state === 'done' ? <CheckIcon size={12} /> : i + 1}
                </span>
                <span className="stp__label">{s.short}</span>
                <span className="stp__date">
                  {dates[i] ?? (state === 'current' ? (waitingUntil ?? 'Now') : '—')}
                </span>
                <span className="sr-only">
                  {s.label}: {state === 'done' ? 'done' : state === 'current' ? 'in progress' : 'not started'}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
