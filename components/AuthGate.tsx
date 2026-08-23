'use client';

import { useAuth } from '@/lib/auth';
import { LoginView } from './LoginView';

/** Nothing renders until the session is resolved and, where required, a second
    factor is verified. This is UX, not security: the data itself is protected by
    row level security in Postgres, which does not trust this component. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { configured, stage } = useAuth();

  // Unconfigured means demo mode: the portal opens on seed data with no sign-in.
  // Shell renders the banner that says so, inside the content column.
  if (!configured) return <>{children}</>;

  if (stage === 'loading') {
    return (
      <div className="auth auth--loading">
        <p className="auth__loading">Checking your session…</p>
      </div>
    );
  }

  if (stage === 'signed-out' || stage === 'mfa-required') {
    return <LoginView />;
  }

  return <>{children}</>;
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
