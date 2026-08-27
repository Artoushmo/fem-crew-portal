'use client';

import { useState } from 'react';
import { useAgreement, useProgressActions } from '@/lib/assignment-state';
import { STAGES, stageAction, type Assignment } from '@/lib/assignments';
import { CheckIcon } from './Icons';

/** The one thing to do right now on this assignment. Renders the reason instead
    of the button when the step is not available yet, so the workflow explains
    itself rather than going quiet. */
export function StageAction({ assignment }: { assignment: Assignment }) {
  const { signed } = useAgreement();
  const { advance, signContract, contractUrl } = useProgressActions();
  const [notice, setNotice] = useState<string | null>(null);
  const action = stageAction(assignment, signed);

  // Step one with paperwork of its own: the contract has to be readable before
  // it can be signed, so reading it is part of the step rather than a link
  // somewhere else on the page.
  const unsignedContract =
    assignment.stage === 0 && assignment.contract && !assignment.contract.signedOn
      ? assignment.contract
      : null;

  const openContract = async () => {
    setNotice(null);
    try {
      window.open(await contractUrl(assignment.id), '_blank', 'noopener');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not open the contract.');
    }
  };

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
      {/* Says why the step came back. Without it, finding yourself at step one
          again reads as the portal losing your work. */}
      {assignment.reopened && (
        <p className="stage-act__reopened" role="status">
          {assignment.reopened}
        </p>
      )}

      <div className="stage-act__body">
        <p className="stage-act__step">
          Step {assignment.stage + 1} of {STAGES.length}
        </p>
        <p className="stage-act__label">{STAGES[assignment.stage].label}</p>
        <p className="stage-act__hint">{action.blocked ?? action.hint}</p>
      </div>

      {unsignedContract ? (
        <div className="stage-act__pair">
          <button type="button" className="btn btn--outline stage-act__btn" onClick={openContract}>
            Read it
          </button>
          <button
            type="button"
            className="btn btn--primary stage-act__btn"
            onClick={() => signContract(assignment.id)}
          >
            Sign
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--primary stage-act__btn"
          disabled={Boolean(action.blocked)}
          onClick={() => advance(assignment.id)}
        >
          {action.label}
        </button>
      )}

      {notice && (
        <p className="auth__error" role="alert">
          {notice}
        </p>
      )}
    </div>
  );
}
