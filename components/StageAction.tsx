'use client';

import { useState } from 'react';
import { useAgreement, useProgressActions } from '@/lib/assignment-state';
import { STAGES, stageAction, type Assignment } from '@/lib/assignments';
import { CheckIcon } from './Icons';

/** The one thing to do right now on this assignment. Renders the reason instead
    of the button when the step is not available yet, so the workflow explains
    itself rather than going quiet. */
export function StageAction({
  assignment,
  onOpenBriefing,
  briefingSeen = true,
}: {
  assignment: Assignment;
  /** Sends them to the briefing tab. */
  onOpenBriefing?: () => void;
  /** Whether they have actually opened it this visit. */
  briefingSeen?: boolean;
}) {
  const { signed } = useAgreement();
  const { advance, deliver, sendInvoice, stepBack } = useProgressActions();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const action = stageAction(assignment, signed);

  // Past the last step there is nothing to press. Saying so beats an empty
  // panel, which reads as something that failed to load.
  if (!action) {
    return (
      <div className="stage-act stage-act--waiting">
        <div className="stage-act__body">
          <p className="stage-act__label">
            {assignment.payment.state === 'paid' ? 'All done' : 'Waiting on FEM'}
          </p>
          <p className="stage-act__hint">
            {assignment.payment.state === 'paid'
              ? 'Paid and closed.'
              : 'Invoice in. FEM confirms payment.'}
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

      {/* Two ways of saying where the work went, and neither needs typing.
          Pasting a link is one; having already put it where FEM asked is the
          other, and that one was being refused for want of a url that does not
          exist. */}
      {assignment.stage === 3 && asking ? (
        <div className="deliver">
          <p className="deliver__gallery">
            {assignment.gallery ? (
              <>
                Add your files to{' '}
                <a href={assignment.gallery.link} target="_blank" rel="noopener noreferrer">
                  the FEM gallery
                </a>
                , then mark it delivered.
              </>
            ) : (
              'Send the files as usual, then say where they went.'
            )}
          </p>

          <div className="deliver__choices">
            <label className="btn btn--outline stage-act__btn">
              Add a link
              <input
                type="url"
                className="sr-only"
                onChange={async (e) => {
                  const url = e.target.value;
                  if (!url) return;
                  setBusy(true);
                  setNotice(null);
                  try {
                    await deliver(assignment.id, url, '');
                    setAsking(false);
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : 'Could not record that.');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>

            <button
              type="button"
              className="btn btn--primary stage-act__btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setNotice(null);
                try {
                  await deliver(assignment.id, '', '');
                  setAsking(false);
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : 'Could not record that.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Saving...' : 'Mark delivered'}
            </button>
          </div>
        </div>
      ) : assignment.stage === 4 ? (
        <div className="stage-act__pair">
          <label className={`btn btn--primary stage-act__btn ${busy ? 'is-busy' : ''}`}>
            {busy ? 'Sending...' : 'Upload your invoice'}
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                setNotice(null);
                try {
                  await sendInvoice(assignment.id, file);
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : 'Could not send that.');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--primary stage-act__btn"
          disabled={Boolean(action.blocked)}
          onClick={() => (assignment.stage === 3 ? setAsking(true) : advance(assignment.id))}
        >
          {action.label}
        </button>
      )}

      {notice && (
        <p className="auth__error" role="alert">
          {notice}
        </p>
      )}

      {/* Accepting is final, so step one has no way back. Everything after it
          does: a misclick there is a message to FEM otherwise. */}
      {assignment.stage > 1 && assignment.payment.state !== 'paid' && (
        <p className="stage-act__undo">
          <button
            type="button"
            className="link-arrow link-arrow--button"
            onClick={async () => {
              setNotice(null);
              try {
                await stepBack(assignment.id);
              } catch (err) {
                setNotice(err instanceof Error ? err.message : 'Could not go back.');
              }
            }}
          >
            Go back a step
          </button>
        </p>
      )}
    </div>
  );
}
