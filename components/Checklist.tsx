'use client';

import { useEffect, useState } from 'react';

/** Tickable list for shot lists and kit. State is the freelancer's own working
    memory for the day, so it lives in localStorage rather than on the server. */
export function Checklist({
  storageKey,
  items,
  columns = false,
}: {
  storageKey: string;
  items: string[];
  columns?: boolean;
}) {
  const [ticked, setTicked] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setTicked(JSON.parse(raw));
    } catch {
      /* corrupted or unavailable storage just means an empty list */
    }
    setReady(true);
  }, [storageKey]);

  const toggle = (item: string) => {
    setTicked((prev) => {
      const next = prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item];
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* not fatal — the list still works for this session */
      }
      return next;
    });
  };

  const done = items.filter((i) => ticked.includes(i)).length;

  return (
    <div className="checklist">
      <div className="checklist__head">
        <span className="checklist__count">
          {done} of {items.length}
        </span>
        <span className="checklist__bar" aria-hidden>
          <span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </span>
      </div>

      <ul className={`checklist__items ${columns ? 'checklist__items--cols' : ''}`}>
        {items.map((item) => {
          const on = ready && ticked.includes(item);
          return (
            <li key={item}>
              <label className={`check ${on ? 'check--on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(item)} />
                <span className="check__box" aria-hidden />
                <span className="check__text">{item}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
