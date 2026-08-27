'use client';

import { useAuth } from '@/lib/auth';
import { BrandLoader } from './BrandLoader';
import { LoginView } from './LoginView';
import { Logo } from './Logo';
import { MfaSetup } from './MfaSetup';

/** Nothing renders until the session is resolved and, where required, a second
    factor is verified. This is UX, not security: the data itself is protected by
    row level security in Postgres, which does not trust this component. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { configured, stage, factors } = useAuth();

  // Unconfigured means demo mode: the portal opens on seed data with no sign-in.
  // Shell renders the banner that says so, inside the content column.
  if (!configured) return <>{children}</>;

  if (stage === 'loading') {
    return (
      <div className="auth auth--loading">
        <BrandLoader />
      </div>
    );
  }

  if (stage === 'signed-out') return <LoginView />;

  if (stage === 'mfa-required') {
    // Two different situations wear the same stage. Someone with an
    // authenticator just has to open it. Someone who was promoted this morning
    // has nothing to open, and the code screen is a dead end for them -- so they
    // get the enrolment instead.
    return factors.length > 0 ? <LoginView /> : <MfaEnrolmentRequired />;
  }

  return <>{children}</>;
}

/** The account was given a role that requires a second factor, and does not
    have one yet. Nothing else in the portal will answer until it does: RLS
    refuses every read, so a half-open portal would just look broken. */
function MfaEnrolmentRequired() {
  const { signOut } = useAuth();

  return (
    <div className="auth">
      <div className="auth__panel auth__panel--wide">
        <div className="auth__brand">
          <Logo />
        </div>

        <div className="auth__body">
          <p className="auth__eyebrow">Crew Portal</p>
          <h1 className="auth__title">Link an authenticator</h1>
          <p className="auth__lead">
            Your role at Fast Elevate Media requires a second factor. Until one is
            linked the portal has nothing to show you.
          </p>

          <MfaSetup />

          <p className="auth__foot">
            <button type="button" className="link-arrow link-arrow--button" onClick={signOut}>
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Without Supabase credentials the portal shows seed data to anyone who opens
    it. Say so loudly, so an unconfigured deployment can never be mistaken for a
    protected one. */
export function DemoBanner() {
  return (
    <p className="demo-banner">
      <strong>Demo</strong> — sample data, no sign-in. Set the Supabase environment
      variables to enable authentication.
    </p>
  );
}
