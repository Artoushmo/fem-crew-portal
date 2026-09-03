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
  ClientsIcon,
  TeamIcon,
} from './Icons';
import { useAuth } from '@/lib/auth';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';

/** `short` is what the mobile tab bar uses — full labels do not fit at 375px.
    `staffOnly` items stay hidden from freelancers, who would only get a page
    the database refuses to answer anyway. */
const DASHBOARD = { href: '/', label: 'Dashboard', short: 'Home', Icon: DashboardIcon };
const CLIENTS = { href: '/clients', label: 'Clients', short: 'Clients', Icon: ClientsIcon };
const TEAM = { href: '/team', label: 'Team', short: 'Team', Icon: TeamIcon };
const ASSIGNMENTS = { href: '/assignments', label: 'Assignments', short: 'Jobs', Icon: AssignmentsIcon };
const PAYMENTS = { href: '/payments', label: 'Payments', short: 'Pay', Icon: FeeIcon };
const DOCUMENTS = { href: '/documents', label: 'Documents', short: 'Docs', Icon: DocumentsIcon };
const PROFILE = { href: '/profile', label: 'Profile', short: 'Profile', Icon: ProfileIcon };

/** FEM's order follows the work: a client to book for, crew to book, then the
    assignment that joins them. Someone setting up their first job walks down
    the rail in the order they need it, rather than starting at the screen that
    refuses to do anything until the other two exist.

    A freelancer never creates any of that, so theirs stays as it was: what is
    coming up, what is owed, what to sign. */
const STAFF_NAV = [DASHBOARD, CLIENTS, TEAM, ASSIGNMENTS, PAYMENTS, DOCUMENTS, PROFILE];
const CREW_NAV = [DASHBOARD, ASSIGNMENTS, PAYMENTS, DOCUMENTS, PROFILE];

export const NAV = STAFF_NAV;

/** The rail and the tab bar both need the same list. */
export function visibleNav(role: string | undefined) {
  const isStaff = role === 'staff' || role === 'admin' || role === 'superadmin';
  return isStaff ? STAFF_NAV : CREW_NAV;
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
