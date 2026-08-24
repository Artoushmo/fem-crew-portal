'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Logo } from './Logo';

type Step = 'email' | 'code' | 'mfa';

// Must not be shorter than Supabase's "minimum interval per user" (60s), or the
// resend button becomes available before the server will honour it.
const RESEND_SECONDS = 60;

// Supabase's email OTP length is configurable from 6 to 10 digits, so accept the
// full range rather than silently truncating. TOTP is always 6.
const MIN_CODE = 6;
const MAX_CODE = { code: 10, mfa: 6 } as const;

export function LoginView() {
  const { stage, sendCode, verifyCode, verifyMfa } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeField = useRef<HTMLInputElement>(null);
  const maxCode = step === 'mfa' ? MAX_CODE.mfa : MAX_CODE.code;

  // The provider decides when a second factor is outstanding; follow it rather
  // than guessing from the code step.
  useEffect(() => {
    if (stage === 'mfa-required') setStep('mfa');
  }, [stage]);

  useEffect(() => {
    if (step !== 'email') codeField.current?.focus();
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (step === 'email') {
        await sendCode(email);
        setStep('code');
        setCooldown(RESEND_SECONDS);
      } else if (step === 'code') {
        await verifyCode(email, code);
        setCode('');
      } else {
        await verifyMfa(code);
      }
    } catch (err) {
      setError(readableError(err, step));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      await sendCode(email);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(readableError(err, 'email'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__panel">
        <div className="auth__brand">
          <Logo />
        </div>

        <div className="auth__body">
          <p className="auth__eyebrow">
            {step === 'mfa' ? 'Two-factor authentication' : 'Crew sign in'}
          </p>
          <h1 className="auth__title">{TITLES[step]}</h1>
          <p className="auth__lead">
            {step === 'email' && 'We send a one-time code to your FEM address.'}
            {step === 'code' && (
              <>
                Enter the code sent to <strong>{email}</strong>.
              </>
            )}
            {step === 'mfa' && 'Enter the current code from your authenticator app.'}
          </p>

          <form onSubmit={submit} className="auth__form" noValidate>
            {step === 'email' ? (
              <label className="field">
                <span className="field__label">Email address</span>
                <input
                  type="email"
                  name="email"
                  className="field__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>
            ) : (
              <label className="field">
                <span className="field__label">
                  {step === 'mfa' ? 'Authenticator code' : 'Verification code'}
                </span>
                <input
                  ref={codeField}
                  type="text"
                  name="code"
                  className="field__input field__input--code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, maxCode))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  // TOTP is always six digits; an emailed code's length varies by
                  // project, so hinting a count there would mislead.
                  placeholder={step === 'mfa' ? '000000' : ''}
                  maxLength={maxCode}
                  required
                />
              </label>
            )}

            {error && (
              <p className="auth__error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn--primary auth__submit"
              disabled={busy || (step === 'email' ? !email : code.length < MIN_CODE)}
            >
              {busy ? 'One moment…' : SUBMIT[step]}
            </button>
          </form>

          {step === 'code' && (
            <div className="auth__foot">
              <button
                type="button"
                className="link-arrow link-arrow--button"
                onClick={resend}
                disabled={busy || cooldown > 0}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Send a new code'}
              </button>
              <button
                type="button"
                className="link-arrow link-arrow--button auth__back"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              >
                Use a different address
              </button>
            </div>
          )}

          {step === 'mfa' && (
            <p className="auth__note">
              Lost your authenticator? Ask your FEM producer to reset it — for security
              it cannot be done from here.
            </p>
          )}
        </div>
      </div>

      <p className="auth__legal">
        Access is by invitation. FEM creates crew accounts; there is no self sign-up.
      </p>
    </div>
  );
}

const TITLES: Record<Step, string> = {
  email: 'Sign in to the Crew Portal',
  code: 'Check your email',
  mfa: 'One more step',
};

const SUBMIT: Record<Step, string> = {
  email: 'Send code',
  code: 'Verify and continue',
  mfa: 'Verify',
};

/** Supabase messages are aimed at developers. Say what the person should do,
    without confirming whether an address has an account. */
function readableError(err: unknown, step: Step) {
  const message = err instanceof Error ? err.message.toLowerCase() : '';

  if (message.includes('rate') || message.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (step === 'mfa') {
    return 'That code was not accepted. Check your authenticator and try the current code.';
  }
  // Supabase returns "Token has expired or is invalid" for both cases, so do not
  // claim it expired — the usual cause is an older email after a second code was
  // requested, which silently voids the first.
  if (step === 'code') {
    return 'That code was not accepted. Use the most recent email, or request a new code.';
  }
  if (message.includes('signups not allowed') || message.includes('not found')) {
    return 'If that address has crew access, a code is on its way.';
  }
  return 'Something went wrong. Try again, or contact your FEM producer.';
}
