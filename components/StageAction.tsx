'use client';

import { useAgreement, useProgressActions } from '@/lib/assignment-state';
import { STAGES, stageAction, type Assignment } from '@/lib/assignments';
import { CheckIcon } from './Icons';

/** The one thing to do right now on this assignment. Renders the reason instead
    of the button when the step is not available yet, so the workflow explains
    itself rather than going quiet. */
export function StageAction({ assignment }: { assignment: Assignment }) {
  const { signed } = useAgreement();
  const { advance } = useProgressActions();
  const action = stageAction(assignment, signed);

  if (!action) {
    return (
      <div className="stage-act stage-act--waiting">
        <div className="stage-act__body">
          <p className="stage-act__label">Waiting on FEM</p>
          <p className="stage-act__hint">
            {assignment.payment.state === 'paid'
              ? 'Paid — nothing left to do.'
              : 'Your invoice is in. FEM confirms the payment.'}
          </p>
        </div>
        {assignment.payment.state === 'paid' && (
          <span className="stage-act__done" aria-hidden>
            <CheckIcon size={18} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`stage-act ${action.blocked ? 'stage-act--blocked' : ''}`}>
      <div className="stage-act__body">
        <p className="stage-act__step">
          Step {assignment.stage + 1} of {STAGES.length}
        </p>
        <p className="stage-act__label">{STAGES[assignment.stage].label}</p>
        <p className="stage-act__hint">{action.blocked ?? action.hint}</p>
      </div>

      <button
        type="button"
        className="btn btn--primary stage-act__btn"
        disabled={Boolean(action.blocked)}
        onClick={() => advance(assignment.id)}
      >
        {action.label}
      </button>
    </div>
  );
}
