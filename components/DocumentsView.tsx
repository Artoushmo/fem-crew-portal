'use client';

import { useState } from 'react';
import { useAgreement, useProgressActions } from '@/lib/assignment-state';
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
  const { signAgreement } = useProgressActions();
  const { doc, loading, error, canManage, upload, openUrl } = useAgreementDoc(agreement.year);
  const agreementId = agreement.id;

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const open = async () => {
    setNotice(null);
    try {
      window.open(await openUrl(), '_blank', 'noopener');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not open the document.');
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
              <button type="button" className="btn btn--outline" onClick={open}>
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

        <p className="eyebrow eyebrow--spaced">Archive</p>

        <ul className="list">
          {archive.map((doc) => (
            <li key={doc.year} className="row">
              <div className="row__summary row__summary--static">
                <span className="row__main">
                  <span className="row__title">Freelancer Agreement {doc.year}</span>
                  <span className="row__client">Signed on {doc.signedOn}</span>
                </span>
                <button type="button" className="link-arrow link-arrow--button">
                  Download →
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
