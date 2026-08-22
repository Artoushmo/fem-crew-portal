import Link from 'next/link';
import { freelancer } from '@/lib/assignments';
import { Logo } from './Logo';

/** The obsidian block at the top of every page. Its lower edge is cut into the
    shallow upward chevron used across the Fast Elevate Media site. Pass hero
    content as children to have it sit inside the dark area.

    The logo only appears here below 768px; on desktop it lives in the rail. */
export function Masthead({ children }: { children?: React.ReactNode }) {
  return (
    <div className="masthead">
      <div className="masthead__inner">
        <div className="topbar">
          <Link
            href="/"
            className="topbar__brand"
            aria-label="Fast Elevate Crew Portal — Dashboard"
          >
            <Logo />
          </Link>

          <Link href="/profile" className="avatar" aria-label="Profile">
            {freelancer.initials}
          </Link>
        </div>

        {children && <div className="hero">{children}</div>}
      </div>
    </div>
  );
}
