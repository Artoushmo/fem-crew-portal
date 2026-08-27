'use client';

import { useAuth } from '@/lib/auth';
import { DashboardView } from '../DashboardView';
import { StaffDashboard } from './StaffDashboard';

/** A producer and a freelancer both open the portal on this route, and want
    opposite things from it: one is asking what still needs booking, the other
    what they personally have to do next. */
export function DashboardRouter() {
  const { profile, configured } = useAuth();

  if (!configured || !profile || profile.role === 'freelancer') {
    return <DashboardView />;
  }

  return <StaffDashboard />;
}
