import { MARK_SRC } from './Logo';

/** The circular F mark inside a turning ring, breathing gently. Used wherever
    the portal is resolving a session, so a wait still looks like FEM.

    No lettermark fallback: if the file were ever missing, an empty ring reads
    better than a stray serif "F". */
export function BrandLoader({ label }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader__stage">
        <span className="loader__ring" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK_SRC} alt="" className="loader__mark" aria-hidden />
      </div>
      <span className="sr-only">{label ?? 'Loading'}</span>
      {label && <p className="loader__label">{label}</p>}
    </div>
  );
}
