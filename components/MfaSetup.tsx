'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { requireSupabase } from '@/lib/supabase';

interface Enrolment {
  factorId: string;
  qr: string;
  secret: string;
}

/** Enrol or remove a TOTP factor. Works with Google Authenticator, 1Password,
    Apple Passwords and anything else that speaks TOTP. */
export function MfaSetup() {
  const { configured, factors, profile, refreshFactors } = useAuth();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) return null;

  const enrolled = factors.length > 0;
  const privileged = profile?.role !== 'freelancer';

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const client = requireSupabase();

      // An abandoned attempt leaves an unverified factor behind, and Supabase
      // then refuses a second one under the same name. Clear those out first so
      // retrying just works.
      const { data: existing } = await client.auth.mfa.listFactors();
      const stale = (existing?.all ?? []).filter((f) => f.status !== 'verified');
      await Promise.all(stale.map((f) => client.auth.mfa.unenroll({ factorId: f.id })));

      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      });
      if (enrollError) throw enrollError;
      setEnrolment({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start setup.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrolment) return;
    setError(null);
    setBusy(true);
    try {
      const client = requireSupabase();
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
        factorId: enrolment.factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await client.auth.mfa.verify({
        factorId: enrolment.factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;

      setEnrolment(null);
      setCode('');
      await refreshFactors();
    } catch {
      setError('That code was not accepted. Try the current one from your app.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (factorId: string) => {
    setBusy(true);
    setError(null);
    try {
      const { error: unenrollError } = await requireSupabase().auth.mfa.unenroll({ factorId });
      if (unenrollError) throw unenrollError;
      await refreshFactors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the factor.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel__title">Two-factor authentication</h2>

      {enrolled ? (
        <>
          <p className="state state--ok">
            Authenticator linked. Sign-in asks for a code from your app.
          </p>
          <ul className="files">
            {factors.map((f) => (
              <li key={f.id}>
                <div className="file file--static">
                  <span className="file__kind">TOTP</span>
                  <span className="file__name">{f.friendly_name ?? 'Authenticator'}</span>
                  <button
                    type="button"
                    className="link-arrow link-arrow--button link-arrow--danger"
                    onClick={() => remove(f.id)}
                    disabled={busy || privileged}
                    title={
                      privileged
                        ? 'Required for your role — ask an admin to reset it.'
                        : undefined
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {privileged && (
            <p className="panel__hint panel__hint--after">
              Two-factor is mandatory for FEM staff and admins, so it cannot be removed
              here.
            </p>
          )}
        </>
      ) : enrolment ? (
        <>
          <p className="panel__hint">
            Scan this with Google Authenticator, 1Password, Apple Passwords or any TOTP
            app, then enter the code it shows.
          </p>

          {/* Supabase returns this either as a data URI or as raw SVG markup,
              depending on version. Injecting a data URI as HTML renders the
              "data:image/svg+xml" prefix as text and leaves a QR the camera
              cannot read, so branch on what actually came back. */}
          {enrolment.qr.trimStart().startsWith('<svg') ? (
            <div className="mfa__qr" dangerouslySetInnerHTML={{ __html: enrolment.qr }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mfa__qr mfa__qr--image" src={enrolment.qr} alt="" />
          )}

          <details className="mfa__manual">
            <summary>Can&rsquo;t scan? Enter the key by hand</summary>
            <code>{enrolment.secret}</code>
          </details>

          <form onSubmit={confirm} className="mfa__confirm">
            <label className="field">
              <span className="field__label">Code from your app</span>
              <input
                type="text"
                className="field__input field__input--code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                autoFocus
              />
            </label>

            {error && (
              <p className="auth__error" role="alert">
                {error}
              </p>
            )}

            <div className="panel__actions">
              <button
                type="submit"
                className="btn btn--primary btn--sm"
                disabled={busy || code.length < 6}
              >
                Confirm
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => {
                  setEnrolment(null);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p className="panel__hint">
            {privileged
              ? 'Required for your role. Link an authenticator app to keep your access.'
              : 'Adds a code from your phone on top of the emailed one. Recommended.'}
          </p>
          {error && (
            <p className="auth__error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn--primary btn--sm" onClick={start} disabled={busy}>
            Set up authenticator
          </button>
        </>
      )}
    </section>
  );
}
