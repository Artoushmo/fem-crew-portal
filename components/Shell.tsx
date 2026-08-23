'use client';

import { useEffect, useState } from 'react';
import { AssignmentProvider } from '@/lib/assignment-state';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

const STORAGE_KEY = 'fem.rail.collapsed';

export function Shell({ children }: { children: React.ReactNode }) {
  // Always render expanded on the server, then adopt the stored preference once
  // mounted, so the markup cannot mismatch during hydration.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  const toggle = () => {
    setCollapsed((wasCollapsed) => {
      const next = !wasCollapsed;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <AssignmentProvider>
      <div className={`layout ${collapsed ? 'layout--collapsed' : ''}`}>
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <div className="shell">{children}</div>
        <BottomNav />
      </div>
    </AssignmentProvider>
  );
}
