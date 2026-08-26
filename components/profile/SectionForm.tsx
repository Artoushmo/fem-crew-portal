'use client';

import { useState } from 'react';

interface Props {
  title: string;
  hint?: string;
  /** Called on save. Resolve to commit, throw to surface the message. */
  onSave: () => Promise<void>;
  /** Nothing to commit yet — the save bar stays hidden. */
  dirty: boolean;
  onReset?: () => void;
  children: React.ReactNode;
}

/** One settings block with its own save. Saving per section rather than one
    button for the whole page keeps a mistake in one place from blocking the
    rest, and makes it obvious what was just written. */
export function SectionForm({ title, hint, onSave, dirty, onReset, children }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel section-form" onSubmit={submit}>
      <div className="section-form__head">
        <h2 className="panel__title">{title}</h2>
        {saved && !dirty && (
          <span className="section-form__saved" role="status">
            Saved
          </span>
        )}
      </div>
      {hint && <p className="panel__hint">{hint}</p>}

      {children}

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      {dirty && (
        <div className="section-form__bar">
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {onReset && (
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={onReset}
              disabled={busy}
            >
              Discard
            </button>
          )}
        </div>
      )}
    </form>
  );
}

/** Labelled input used across every settings section. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}
