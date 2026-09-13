'use client';

import { Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { PaymentsView } from '../PaymentsView';
import { StaffPaymentsView } from './StaffPaymentsView';

/** A freelancer asks when their money arrives. A producer asks what is still
    owed and to whom. Same word, two screens. */
export function PaymentsRouter() {
  const { profile, configured } = useAuth();

  if (!configured || !profile || profile.role === 'freelancer') {
    return <PaymentsView />;
  }

  // useSearchParams has to sit inside a boundary for the static export.
  return (
    <Suspense fallback={null}>
      <StaffPaymentsView />
    </Suspense>
  );
}
