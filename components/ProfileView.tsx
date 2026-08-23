'use client';

import { useAgreement, useProgressActions } from '@/lib/assignment-state';
import { useAuth } from '@/lib/auth';
import { freelancer } from '@/lib/assignments';
import { Masthead } from './Masthead';
import { MfaSetup } from './MfaSetup';

const ROLE_LABEL: Record<string, string> = {
  freelancer: 'Freelancer',
  staff: 'FEM staff',
  admin: 'Administrator',
};

export function ProfileView() {
  const agreement = useAgreement();
  const { reset, unsignAgreement, signAgreement } = useProgressActions();
  const { configured, profile, session, signOut } = useAuth();

  const name = profile?.full_name ?? freelancer.name;
  const email = profile?.email ?? session?.user?.email ?? freelancer.email;

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Profile</h1>
        <p className="hero__sub">{name}</p>
      </Masthead>

      <main className="content content--wide">
        <p className="eyebrow">Your details</p>

        <dl className="detail-list">
          <div>
            <dt>Name</dt>
            <dd>{name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${email}`}>{email}</a>
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{ROLE_LABEL[profile?.role ?? 'freelancer'] ?? 'Freelancer'}</dd>
          </div>
          <div>
            <dt>Agreement</dt>
            <dd>
              {agreement.year} — {agreement.signed ? 'signed' : 'not signed'}
            </dd>
          </div>
        </dl>

        <p className="eyebrow eyebrow--spaced">Security</p>
        <MfaSetup />

        {configured && (
          <div className="panel__actions panel__actions--spaced">
            <button type="button" className="btn btn--outline btn--sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}

        {!configured && (
          <>
            <p className="eyebrow eyebrow--spaced">Demo</p>

            <section className="panel">
              <h2 className="panel__title">Start over</h2>
              <p className="panel__hint">
                Progress is stored in this browser only. Resetting puts every assignment
                back to its starting stage and clears your ticked shot and kit lists.
              </p>
              <div className="panel__actions">
                <button type="button" className="btn btn--outline btn--sm" onClick={reset}>
                  Reset demo progress
                </button>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={agreement.signed ? unsignAgreement : signAgreement}
                >
                  {agreement.signed ? 'Unsign agreement' : 'Sign agreement'}
                </button>
              </div>
              <p className="panel__hint panel__hint--after">
                Unsigning shows what a freelancer sees before their yearly agreement is in
                place: assignments cannot be accepted.
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
