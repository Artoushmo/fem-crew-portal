'use client';

import { useAuth } from '@/lib/auth';
import { AssignmentsView } from '../AssignmentsView';
import { StaffAssignmentsView } from './StaffAssignmentsView';

/** The same route means two different jobs. A freelancer is looking at the work
    they have been given; a producer is looking at work that needs someone. They
    share a word, not a screen. */
export function AssignmentsRouter() {
  const { profile, configured } = useAuth();

  // Demo mode has no session to read a role from, and the sample data is the
  // freelancer's.
  if (!configured || !profile || profile.role === 'freelancer') {
    return <AssignmentsView />;
  }

  return <StaffAssignmentsView />;
}
