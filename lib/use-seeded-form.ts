'use client';

import { useEffect, useRef, useState } from 'react';

/** Form state seeded from the database, that stops listening once the person
    starts typing.

    The bug this exists for: every section reseeded itself whenever the profile
    object changed identity, and it changed on every save anywhere on the page.
    Save your invoicing details and the name you had half-typed under Personal
    was silently replaced by whatever was stored. Uploading a photo did the same
    thing, which is how it was found.

    So a reload only reaches a section that has nothing to lose. Once a field is
    touched, that section owns its values until it saves or resets -- at which
    point it starts listening again. */
export function useSeededForm<T>(seed: T, key: unknown) {
  const [form, setForm] = useState<T>(seed);
  const [initial, setInitial] = useState<T>(seed);
  const seenKey = useRef(key);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const seedJson = JSON.stringify(seed);

  useEffect(() => {
    const next = JSON.parse(seedJson) as T;

    // A different row entirely -- a new sign-in, say -- always wins. Keeping
    // one person's half-typed phone number over another's is worse than losing
    // it.
    if (seenKey.current !== key) {
      seenKey.current = key;
      setForm(next);
      setInitial(next);
      return;
    }

    if (dirtyRef.current) return;

    setForm(next);
    setInitial(next);
  }, [seedJson, key]);

  /** After a successful save: what was typed is now what is stored. */
  const commit = () => setInitial(form);

  const reset = () => setForm(initial);

  return { form, setForm, dirty, commit, reset, initial };
}
