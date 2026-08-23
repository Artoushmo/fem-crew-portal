'use client';

import { useAgreement, useProgressActions } from '@/lib/assignment-state';
import { Masthead } from './Masthead';

const archive = [
  { year: 2025, signedOn: '9 January 2025' },
  { year: 2024, signedOn: '15 January 2024' },
];

export function DocumentsView() {
  const agreement = useAgreement();
  const { signAgreement } = useProgressActions();

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

          {!agreement.signed && (
            <div className="facts">
              <p className="prose">
                One agreement covers every assignment this year. Until it is signed you
                cannot accept new work.
              </p>
            </div>
          )}

          <div className="card__actions">
            {agreement.signed ? (
              <button type="button" className="btn btn--outline">
                Download PDF
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={signAgreement}>
                Sign agreement
              </button>
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
