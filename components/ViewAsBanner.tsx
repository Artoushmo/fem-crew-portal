'use client';

import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/use-team';

/** Says, permanently and in the way, that these are not your own screens.
 *
 * A preview you can forget you are in is how someone concludes the portal is
 * broken because Team disappeared. It cannot be dismissed -- only switched off,
 * which is the same button. */
export function ViewAsBanner() {
  const { viewAs, setViewAs } = useAuth();

  if (!viewAs) return null;

  return (
    <div className="viewas" role="status">
      <span>
        Viewing as <strong>{ROLE_LABEL[viewAs]}</strong>. Your own access is unchanged.
      </span>
      <button type="button" className="viewas__exit" onClick={() => setViewAs(null)}>
        Back to my own view
      </button>
    </div>
  );
}
