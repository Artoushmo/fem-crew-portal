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
  const { advance, signContract, returnSignedCopy, deliver, sendInvoice, stepBack, contractUrl } =
    useProgressActions();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
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

      {/* Step five asks where the work went. The files travel the way they
          always have -- a shoot day is tens of gigabytes and already moves by
          WeTransfer or a client drive -- so what is missing is the pointer. */}
      {/* Step three is the one people click through without reading, and the
          briefing is the thing that stops someone turning up with the wrong
          lens. So confirming it waits until the tab has actually been opened. */}
      {assignment.stage === 2 && !briefingSeen && onOpenBriefing ? (
        <div className="stage-act__pair">
          <button type="button" className="btn btn--primary stage-act__btn" onClick={onOpenBriefing}>
            Read the briefing
          </button>
        </div>
      ) : assignment.stage === 4 && asking ? (
        <form
          className="deliver"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setNotice(null);
            try {
              await deliver(assignment.id, link, note);
              setAsking(false);
              setLink('');
              setNote('');
            } catch (err) {
              setNotice(err instanceof Error ? err.message : 'Could not record that.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {assignment.gallery ? (
            <p className="deliver__gallery">
              Add your files to{' '}
              <a href={assignment.gallery.link} target="_blank" rel="noopener noreferrer">
                the FEM gallery
              </a>
              {assignment.gallery.note ? ` — ${assignment.gallery.note}` : ''}, then confirm below.
            </p>
          ) : (
            <input
              className="field__input"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://we.tl/..."
              aria-label="Delivery link"
              autoFocus
              required
            />
          )}
          <input
            className="field__input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything the producer should know (optional)"
            aria-label="Note for the producer"
          />
          <button type="submit" className="btn btn--primary stage-act__btn" disabled={busy}>
            {busy ? 'Saving...' : 'Mark delivered'}
          </button>
          <button
            type="button"
            className="link-arrow link-arrow--button"
            onClick={() => setAsking(false)}
          >
            Cancel
          </button>
        </form>
      ) : assignment.stage === 5 ? (
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
      ) : unsignedContract ? (
        <div className="stage-act__pair">
          <button type="button" className="btn btn--outline stage-act__btn" onClick={openContract}>
            Read it
          </button>
          <button
            type="button"
            className="btn btn--primary stage-act__btn"
            onClick={() => signContract(assignment.id)}
          >
            Sign here
          </button>

          {/* The other way most contracts are signed: print it, sign it, send
              it back. Recorded the same way, against the file returned. */}
          <label className={`btn btn--outline stage-act__btn ${busy ? 'is-busy' : ''}`}>
            {busy ? 'Uploading...' : 'Upload a signed copy'}
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
                  await returnSignedCopy(assignment.id, file);
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : 'Could not upload that file.');
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
          onClick={() => (assignment.stage === 4 ? setAsking(true) : advance(assignment.id))}
        >
          {action.label}
        </button>
      )}

      {notice && (
        <p className="auth__error" role="alert">
          {notice}
        </p>
      )}

      {assignment.stage > 0 && assignment.payment.state !== 'paid' && (
        <p className="stage-act__undo">
          Clicked too soon?{' '}
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
