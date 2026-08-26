'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AssignmentsIcon,
  DashboardIcon,
  DocumentsIcon,
  FeeIcon,
  PanelIcon,
  ProfileIcon,
  TeamIcon,
} from './Icons';
import { useAuth } from '@/lib/auth';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';

/** `short` is what the mobile tab bar uses — full labels do not fit at 375px.
    `staffOnly` items stay hidden from freelancers, who would only get a page
    the database refuses to answer anyway. */
export const NAV = [
  { href: '/', label: 'Dashboard', short: 'Home', Icon: DashboardIcon },
  { href: '/assignments', label: 'Assignments', short: 'Jobs', Icon: AssignmentsIcon },
  { href: '/payments', label: 'Payments', short: 'Pay', Icon: FeeIcon },
  { href: '/documents', label: 'Documents', short: 'Docs', Icon: DocumentsIcon },
  { href: '/team', label: 'Team', short: 'Team', Icon: TeamIcon, staffOnly: true },
  { href: '/profile', label: 'Profile', short: 'Profile', Icon: ProfileIcon },
];

/** The rail and the tab bar both need the same filtered list. */
export function visibleNav(role: string | undefined) {
  const isStaff = role === 'staff' || role === 'admin' || role === 'superadmin';
  return NAV.filter((item) => !item.staffOnly || isStaff);
}

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
  const { profile } = useAuth();
  const items = visibleNav(profile?.role);

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
        {items.map(({ href, label, Icon }) => (
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

      <div className="rail__foot">
        <AccountMenu compact={collapsed} />
      </div>
    </aside>
  );
}
