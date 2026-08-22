import { STATUS_LABEL, type Status } from '@/lib/assignments';

export function StatusPill({ status, onDark = false }: { status: Status; onDark?: boolean }) {
  return (
    <span className={`pill pill--${status} ${onDark ? 'pill--on-dark' : ''}`}>
      <span className="pill__dot" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
