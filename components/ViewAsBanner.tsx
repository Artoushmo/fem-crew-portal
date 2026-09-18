'use client';

import { useAuth } from '@/lib/auth';

/** Says which hat you are wearing, for the people who have two.
 *
 * Permanent while it applies, because forgetting you are on the crew side is
 * how somebody decides the portal is broken because Clients vanished. It cannot
 * be dismissed, only switched back -- which is the same button. */
export function ViewAsBanner() {
  const { asFreelancer, setAsFreelancer } = useAuth();

  if (!asFreelancer) return null;

  return (
    <div className="viewas" role="status">
      <span>
        Working as <strong>crew</strong>. Your own assignments and invoices.
      </span>
      <button type="button" className="viewas__exit" onClick={() => setAsFreelancer(false)}>
        Back to FEM
      </button>
    </div>
  );
}
