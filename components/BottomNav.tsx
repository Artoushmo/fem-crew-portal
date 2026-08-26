'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isActive, visibleNav } from './Sidebar';

export function BottomNav() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const tabs = visibleNav(profile?.role);

  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map(({ href, label, short, Icon }) => (
        <Link
          key={href}
          href={href}
          className="tab"
          aria-label={label}
          aria-current={isActive(pathname, href) ? 'page' : undefined}
        >
          <Icon size={20} />
          <span aria-hidden>{short}</span>
        </Link>
      ))}
    </nav>
  );
}
