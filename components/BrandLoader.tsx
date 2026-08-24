'use client';

import { useEffect, useState } from 'react';
import { MARK_SRC } from './Logo';

/** The circular F mark inside a turning ring, breathing gently. Used wherever
    the portal is resolving a session, so a wait still looks like FEM. */
export function BrandLoader({ label }: { label?: string }) {
  const [hasMark, setHasMark] = useState(false);

  useEffect(() => {
    const probe = new window.Image();
    probe.onload = () => setHasMark(true);
    probe.src = MARK_SRC;
  }, []);

  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader__stage">
        <span className="loader__ring" aria-hidden />
        {hasMark ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={MARK_SRC} alt="" className="loader__mark" aria-hidden />
        ) : (
          <span className="loader__fallback" aria-hidden>
            F
          </span>
        )}
      </div>
      <span className="sr-only">{label ?? 'Loading'}</span>
      {label && <p className="loader__label">{label}</p>}
    </div>
  );
}
