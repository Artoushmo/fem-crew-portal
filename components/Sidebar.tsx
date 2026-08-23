'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAgreement } from '@/lib/assignment-state';
import {
  AssignmentsIcon,
  DashboardIcon,
  DocumentsIcon,
  FeeIcon,
  PanelIcon,
  ProfileIcon,
} from './Icons';
import { Logo } from './Logo';

/** `short` is what the mobile tab bar uses — five full labels do not fit at 375px. */
export const NAV = [
  { href: '/', label: 'Dashboard', short: 'Home', Icon: DashboardIcon },
  { href: '/assignments', label: 'Assignments', short: 'Jobs', Icon: AssignmentsIcon },
  { href: '/payments', label: 'Payments', short: 'Pay', Icon: FeeIcon },
  { href: '/documents', label: 'Documents', short: 'Docs', Icon: DocumentsIcon },
  { href: '/profile', label: 'Profile', short: 'Profile', Icon: ProfileIcon },
];

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const agreement = useAgreement();

  return (
    <aside className="rail">
      <div className="rail__head">
        <Link href="/" className="rail__brand" aria-label="Fast Elevate Crew Portal — Dashboard">
          <Logo compact={collapsed} />
        </Link>
        <button
          type="button"
          className="rail__toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <PanelIcon />
        </button>
      </div>

      <nav className="rail__nav" aria-label="Primary">
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="rail__link"
            aria-current={isActive(pathname, href) ? 'page' : undefined}
            title={collapsed ? label : undefined}
          >
            <Icon />
            <span className="rail__label">{label}</span>
          </Link>
        ))}
      </nav>

      <Link href="/documents" className="rail__agreement">
        <span className="rail__label">Freelancer Agreement {agreement.year}</span>
        <span
          className={`rail__signed ${agreement.signed ? '' : 'rail__signed--todo'}`}
          aria-label={`Freelancer Agreement ${agreement.year} ${
            agreement.signed ? 'signed' : 'not signed'
          }`}
          title={`Freelancer Agreement ${agreement.year} — ${
            agreement.signed ? 'signed' : 'not signed'
          }`}
        >
          <span aria-hidden="true">{agreement.signed ? '✓' : '!'}</span>
          <span className="rail__label" aria-hidden="true">
            {agreement.signed ? 'Signed' : 'Sign now'}
          </span>
        </span>
      </Link>
    </aside>
  );
}
