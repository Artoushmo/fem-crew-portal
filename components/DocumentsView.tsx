'use client';

import { useState } from 'react';
import { useAgreement, useAssignments, useProgressActions } from '@/lib/assignment-state';
import { VAT_RATE, withVat } from '@/lib/assignments';
import { useAgreementDoc } from '@/lib/use-agreement-doc';
import { shortHash } from '@/lib/signing';
import { SigningReceipt } from './SigningReceipt';
import { Masthead } from './Masthead';

const archive = [
  { year: 2025, signedOn: '9 January 2025' },
  { year: 2024, signedOn: '15 January 2024' },
];

export function DocumentsView() {
  const agreement = useAgreement();
  const { signAgreement, fileUrl } = useProgressActions();
  const assignments = useAssignments();

  // Anything that has been invoiced, newest first. Before it is invoiced it is
  // work, not paperwork.
  const invoices = [...assignments]
    .filter((a) => a.payment.state !== 'not-invoiced')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const { doc, loading, error, canManage, upload, openUrl } = useAgreementDoc(agreement.year);
  const agreementId = agreement.id;

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const openAgreement = async () => {
    setNotice(null);
    try {
      window.open(await openUrl(), '_blank', 'noopener');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not open the document.');
    }
  };

  const open = async (path: string) => {
    setNotice(null);
    try {
      window.open(await fileUrl(path), '_blank', 'noopener');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not open that file.');
    }
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setNotice(null);
    try {
      await upload(file);
      setNotice('Uploaded.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not upload that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Documents</h1>
        <p className="hero__sub">Your agreements with FEM.</p>
      </Masthead>

      <main className="content content--wide">
        <p className="eyebrow">Current agreement</p>

        <article className="card">
          <div className="card__head">
            <div>
              <h2 className="card__title">Freelancer Agreement {agreement.year}</h2>
              <p className="card__client">
                {agreement.signed ? `Signed on ${agreement.signedOn}` : 'Not signed yet'}
              </p>
            </div>
            <span
              className={`pill ${agreement.signed ? 'pill--completed' : 'pill--action-required'}`}
            >
              <span className="pill__dot" aria-hidden />
              {agreement.signed ? 'Signed' : 'Action required'}
            </span>
          </div>

          <div className="facts">
            {!agreement.signed && (
              <p className="prose">
                Covers every assignment this year. Needed before you can accept work.
              </p>
            )}

            {!loading && !doc && (
              <p className="prose">
                {canManage
                  ? 'No agreement uploaded yet. Nobody can sign until there is one.'
                  : 'No agreement published yet.'}
              </p>
            )}

            {doc && (
              <p className="prose">
                {doc.original_name} &middot; uploaded{' '}
                {new Date(doc.uploaded_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {doc.sha256 && (
                  <>
                    {' '}
                    &middot; fingerprint <code>{shortHash(doc.sha256)}</code>
                  </>
                )}
              </p>
            )}
          </div>

          {error && (
            <p className="auth__error" role="alert">
              {error}
            </p>
          )}

          {notice && (
            <p className="state state--ok" role="status">
              {notice}
            </p>
          )}

          {agreementId && <SigningReceipt subjectType="agreement" subjectId={agreementId} />}

          <div className="card__actions">
            {doc && (
              <button type="button" className="btn btn--outline" onClick={openAgreement}>
                Read it
              </button>
            )}

            {/* Signing is only offered once there is something to read. A
                signature against a heading is a checkbox, and the database
                refuses it too. */}
            {!canManage && !agreement.signed && doc && (
              <button type="button" className="btn btn--primary" onClick={signAgreement}>
                Sign
              </button>
            )}

            {canManage && (
              <label className={`btn btn--primary ${busy ? 'is-busy' : ''}`}>
                {busy ? 'Uploading\u2026' : doc ? 'Replace' : 'Upload agreement'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  disabled={busy}
                  onChange={pick}
                />
              </label>
            )}
          </div>
        </article>

        {/* Their own books. A freelancer's paperwork with FEM is scattered
            across their email otherwise: what was invoiced, when it was paid,
            and which job it was for. */}
        <p className="eyebrow eyebrow--spaced">Invoices</p>

        {invoices.length === 0 ? (
          <p className="state state--idle">Nothing invoiced yet.</p>
        ) : (
          <ul className="list">
            {invoices.map((a) => (
              <li key={a.id} className="row">
                <div className="payline">
                  <div className="payline__what">
                    <span className="job__title">
                      {a.title} &mdash; {a.client}
                    </span>
                    <span className="job__meta">
                      {a.payment.invoiceNumber ?? 'No number'} &middot; {a.dateLabel}
                      {a.payment.invoicedOn ? ` · sent ${a.payment.invoicedOn}` : ''}
                    </span>
                  </div>

                  <span className={`tag ${a.payment.state === 'paid' ? 'tag--ok' : 'tag--wait'}`}>
                    {a.payment.state === 'paid'
                      ? `Paid ${a.payment.paidOn ?? ''}`.trim()
                      : 'Awaiting payment'}
                  </span>

                  <span className="roles__fee">{withVat(a.fee)}</span>

                  <span className="payline__controls">
                    {a.payment.path && (
                      <button
                        type="button"
                        className="link-arrow link-arrow--button"
                        onClick={() => open(a.payment.path!)}
                      >
                        Open
                      </button>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="field__hint field__hint--block">
          Amounts include {Math.round(VAT_RATE * 100)}% VAT.
        </p>

      </main>
    </>
  );
}
