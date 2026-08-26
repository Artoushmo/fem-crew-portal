'use client';

import { useAgreement, useProgressActions } from '@/lib/assignment-state';
import { useAuth } from '@/lib/auth';
import { profileCompleteness } from '@/lib/profile-types';
import { avatarUrl, useProfileData } from '@/lib/use-profile';
import { BrandLoader } from './BrandLoader';
import { Masthead } from './Masthead';
import { MfaSetup } from './MfaSetup';
import { Tabs } from './Tabs';
import { CredentialsSection } from './profile/CredentialsSection';
import { GearSection } from './profile/GearSection';
import { InvoicingSection } from './profile/InvoicingSection';
import { PersonalSection } from './profile/PersonalSection';
import { WorkSection } from './profile/WorkSection';

const ROLE_LABEL: Record<string, string> = {
  freelancer: 'Freelancer',
  staff: 'FEM staff',
  admin: 'Administrator',
};

export function ProfileView() {
  const { configured, signOut } = useAuth();
  const { profile, crafts, gear, credentials, loading, error, reload } = useProfileData();

  if (!configured) return <DemoProfile />;

  if (loading) {
    return (
      <>
        <Masthead>
          <h1 className="hero__greeting">Profile</h1>
        </Masthead>
        <main className="content content--wide">
          <BrandLoader label="Loading your profile" />
        </main>
      </>
    );
  }

  const progress = profileCompleteness(profile, crafts, gear);
  const avatar = avatarUrl(profile?.avatar_path);

  return (
    <>
      <Masthead>
        <div className="hero__identity">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="hero__avatar" />
          ) : (
            <span className="hero__avatar hero__avatar--empty" aria-hidden />
          )}
          <div>
            <h1 className="hero__greeting">{profile?.full_name ?? 'Your profile'}</h1>
            <p className="hero__sub">
              {ROLE_LABEL[profile?.role ?? 'freelancer']}
              {profile?.base_city ? ` · ${profile.base_city}` : ''}
            </p>
          </div>
        </div>
      </Masthead>

      <main className="content content--wide">
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}

        {progress.done < progress.total && (
          <section className="completeness">
            <div className="completeness__head">
              <p className="eyebrow">Profile completeness</p>
              <span className="completeness__count">
                {progress.done} of {progress.total}
              </span>
            </div>
            <span className="completeness__bar" aria-hidden>
              <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </span>
            <ul className="completeness__list">
              {progress.checks.map((check) => (
                <li key={check.key} className={check.done ? 'is-done' : undefined}>
                  {check.key}
                </li>
              ))}
            </ul>
            <p className="panel__hint panel__hint--after">
              FEM books from these details. The gaps are what stop you showing up in a
              search.
            </p>
          </section>
        )}

        <Tabs
          tabs={[
            {
              id: 'personal',
              label: 'Personal',
              content: <PersonalSection profile={profile} onSaved={reload} />,
            },
            {
              id: 'work',
              label: 'Work',
              content: <WorkSection profile={profile} crafts={crafts} onSaved={reload} />,
            },
            {
              id: 'kit',
              label: 'Kit',
              content: <GearSection profile={profile} gear={gear} onSaved={reload} />,
            },
            {
              id: 'credentials',
              label: 'Licences',
              content: (
                <CredentialsSection
                  profile={profile}
                  credentials={credentials}
                  onSaved={reload}
                />
              ),
            },
            {
              id: 'invoicing',
              label: 'Invoicing',
              content: <InvoicingSection profile={profile} onSaved={reload} />,
            },
            {
              id: 'security',
              label: 'Security',
              content: (
                <>
                  <MfaSetup />
                  <section className="panel">
                    <h2 className="panel__title">Session</h2>
                    <p className="panel__hint">
                      Signing out ends this session on this device only.
                    </p>
                    <button type="button" className="btn btn--outline btn--sm" onClick={signOut}>
                      Sign out
                    </button>
                  </section>
                </>
              ),
            },
          ]}
        />
      </main>
    </>
  );
}

/** Without Supabase there is no profile to read or write, so the screen keeps
    the demo controls instead of pretending to save. */
function DemoProfile() {
  const agreement = useAgreement();
  const { reset, unsignAgreement, signAgreement } = useProgressActions();

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Profile</h1>
        <p className="hero__sub">Demo — sign-in is not configured.</p>
      </Masthead>

      <main className="content content--wide">
        <section className="panel">
          <h2 className="panel__title">Not available in demo</h2>
          <p className="panel__hint">
            Your details, kit and licences live in the database. Connect Supabase to edit
            them.
          </p>
        </section>

        <p className="eyebrow eyebrow--spaced">Demo</p>

        <section className="panel">
          <h2 className="panel__title">Start over</h2>
          <p className="panel__hint">
            Progress is stored in this browser only. Resetting puts every assignment back
            to its starting stage and clears your ticked shot and kit lists.
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
        </section>
      </main>
    </>
  );
}
