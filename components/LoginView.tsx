'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Logo } from './Logo';

type Step = 'email' | 'code' | 'mfa';

// Must not be shorter than Supabase's "minimum interval per user" (60s), or the
// resend button unlocks before the server will honour it.
const RESEND_SECONDS = 60;

// Supabase's email OTP length is configurable from 6 to 10. Accept the whole
// range rather than silently truncating; the hint below is only cosmetic.
const MIN_CODE = 6;
const MAX_CODE = { code: 10, mfa: 6 } as const;
const CODE_HINT = Number(process.env.NEXT_PUBLIC_OTP_LENGTH ?? 8);

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
      // An address without access lands on the code screen too, so this screen
      // never reveals which addresses exist.
      if (step === 'email' && isUnknownAddress(err)) {
        setStep('code');
        setCooldown(RESEND_SECONDS);
      } else {
        setError(readableError(err, step));
        setCode('');
      }
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
      if (isUnknownAddress(err)) setCooldown(RESEND_SECONDS);
      else setError(readableError(err, 'email'));
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
          <p className="auth__eyebrow">Crew Portal</p>
          <h1 className="auth__title">{TITLES[step]}</h1>
          <p className="auth__lead">
            {step === 'email' && 'We’ll email you a sign-in code.'}
            {step === 'code' && (
              <>
                Sent to <strong>{email}</strong>
              </>
            )}
            {step === 'mfa' && 'Enter the code from your authenticator app.'}
          </p>

          <form onSubmit={submit} className="auth__form" noValidate>
            {step === 'email' ? (
              <label className="field">
                <span className="field__label">Email</span>
                <input
                  type="email"
                  name="email"
                  className="field__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>
            ) : (
              <label className="field">
                <span className="field__label">Code</span>
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
                  placeholder={'0'.repeat(step === 'mfa' ? MAX_CODE.mfa : CODE_HINT)}
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
              {busy ? (step === 'email' ? 'Sending…' : 'Verifying…') : 'Continue'}
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
                {cooldown > 0 ? `New code in ${cooldown}s` : 'Send a new code'}
              </button>
              <button
                type="button"
                className="link-arrow link-arrow--button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              >
                Change email
              </button>
            </div>
          )}

          {step === 'mfa' && (
            <p className="auth__note">Lost access? Contact your FEM producer.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const TITLES: Record<Step, string> = {
  email: 'Sign in',
  code: 'Enter your code',
  mfa: 'Two-step verification',
};

function isUnknownAddress(err: unknown) {
  const m = err instanceof Error ? err.message.toLowerCase() : '';
  return m.includes('signups not allowed') || m.includes('not found');
}

/** Supabase messages are written for developers. Keep these short and let the
    buttons on screen offer the next step. */
function readableError(err: unknown, step: Step) {
  const message = err instanceof Error ? err.message.toLowerCase() : '';

  if (message.includes('rate') || message.includes('too many')) {
    return 'Too many attempts. Try again in a minute.';
  }
  if (step !== 'email') {
    // Supabase returns "expired or invalid" for both, so do not claim it expired.
    return 'Incorrect code.';
  }
  return 'Something went wrong. Try again.';
}
