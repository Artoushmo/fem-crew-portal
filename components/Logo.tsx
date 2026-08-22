'use client';

import { useEffect, useState } from 'react';

// Under a basePath (GitHub Pages project sites) public/ assets move with it.
// next/image would handle this, but these are plain <img> tags.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const FULL_SRC = `${BASE}/logo.png`;
const MARK_SRC = `${BASE}/logo-mark.png`;

/** Renders the Fast Elevate Crew Portal lockup from public/logo.png, or the
    circular mark from public/logo-mark.png when the rail is collapsed (falling
    back to the full lockup if no separate mark is supplied).

    The file is probed on mount rather than relying on <img onError>, because the
    load fails before React hydrates and the browser paints a broken-image icon. */
export function Logo({ compact = false }: { compact?: boolean }) {
  const [hasFull, setHasFull] = useState(false);
  const [hasMark, setHasMark] = useState(false);

  useEffect(() => {
    const probe = (src: string, done: (ok: boolean) => void) => {
      const img = new window.Image();
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = src;
    };
    probe(FULL_SRC, setHasFull);
    probe(MARK_SRC, setHasMark);
  }, []);

  if (!hasFull && !hasMark) {
    return (
      <span className={`wordmark ${compact ? 'wordmark--compact' : ''}`}>
        FEM<span>.</span>
      </span>
    );
  }

  const useMark = compact && hasMark;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={useMark ? MARK_SRC : FULL_SRC}
      alt="Fast Elevate Crew Portal"
      className={`logo ${useMark ? 'logo--mark' : ''}`}
    />
  );
}
