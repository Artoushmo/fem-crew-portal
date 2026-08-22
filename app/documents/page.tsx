import { Masthead } from '@/components/Masthead';
import { agreement } from '@/lib/assignments';

const archive = [
  { year: 2025, signedOn: '9 January 2025' },
  { year: 2024, signedOn: '15 January 2024' },
];

export default function DocumentsPage() {
  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Documents</h1>
        <p className="hero__sub">Your agreements with FEM.</p>
      </Masthead>

      <main className="content">
        <p className="eyebrow">Current agreement</p>

        <article className="card">
          <div className="card__head">
            <div>
              <h2 className="card__title">Freelancer Agreement {agreement.year}</h2>
              <p className="card__client">
                {agreement.signed ? `Signed on ${agreement.signedOn}` : 'Not signed yet'}
              </p>
            </div>
            <span className={`pill ${agreement.signed ? 'pill--completed' : 'pill--action-required'}`}>
              <span className="pill__dot" aria-hidden />
              {agreement.signed ? 'Signed' : 'Action required'}
            </span>
          </div>

          <div className="card__actions">
            {agreement.signed ? (
              <button type="button" className="btn btn--outline">
                Download PDF
              </button>
            ) : (
              <button type="button" className="btn btn--primary">
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
