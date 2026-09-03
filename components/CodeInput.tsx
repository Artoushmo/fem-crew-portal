'use client';

import { forwardRef, useState } from 'react';

/** A code shown as one box per digit.

    One real input underneath, not one per box. Separate inputs look the same and
    break the two things that matter most on a phone: pasting the whole code, and
    iOS filling it straight from the SMS. Those need a single field carrying
    autocomplete="one-time-code", so that is what this is -- transparent, full
    size, and on top, with the boxes painted behind it.

    The caret is hidden because the boxes show the position instead; a blinking
    bar sliding across them would say the same thing twice, out of step. */
export const CodeInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (next: string) => void;
    length: number;
    label: string;
    disabled?: boolean;
  }
>(function CodeInput({ value, onChange, length, label, disabled }, ref) {
  const [focused, setFocused] = useState(false);

  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const active = Math.min(value.length, length - 1);

  return (
    <div className="code">
      <span className="field__label code__label">{label}</span>

      <div className="code__wrap">
        <div className="code__boxes" aria-hidden>
          {digits.map((d, i) => (
            <span
              key={i}
              className={`code__box ${d ? 'is-filled' : ''} ${
                focused && i === active && value.length < length ? 'is-active' : ''
              }`}
            >
              {d}
            </span>
          ))}
        </div>

        <input
          ref={ref}
          type="text"
          name="code"
          className="code__input"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={label}
          maxLength={length}
          required
        />
      </div>

      <span className="code__hint">
        {disabled ? ' ' : 'Type it, paste it, or let the message fill it in.'}
      </span>
    </div>
  );
});
