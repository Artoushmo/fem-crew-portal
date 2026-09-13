'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { usePending } from '@/lib/use-pending';
import { isActive, visibleNav } from './Sidebar';

export function BottomNav() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const tabs = visibleNav(profile?.role);
  const pending = usePending();

  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map(({ href, label, short, Icon }) => {
        const count =
          href === '/assignments'
            ? pending.assignments
            : href === '/payments'
              ? pending.payments
              : 0;

        return (
          <Link
            key={href}
            href={href}
            className="tab"
            aria-label={count > 0 ? `${label}, ${count} need attention` : label}
            aria-current={isActive(pathname, href) ? 'page' : undefined}
          >
            <span className="tab__icon">
              <Icon size={20} />
              {count > 0 && (
                <span className="badge badge--dot" aria-hidden>
                  {count}
                </span>
              )}
            </span>
            <span aria-hidden>{short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
