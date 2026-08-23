'use client';

import { useAssignments } from '@/lib/assignment-state';
import { AssignmentList } from './AssignmentList';
import { Masthead } from './Masthead';

export function AssignmentsView() {
  const assignments = useAssignments();

  const open = assignments
    .filter((a) => !(a.stage >= 6 && a.payment.state === 'paid'))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const finished = assignments
    .filter((a) => a.stage >= 6 && a.payment.state === 'paid')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Assignments</h1>
        <p className="hero__sub">
          {open.length} open · {finished.length} finished
        </p>
      </Masthead>

      <main className="content content--wide">
        <p className="eyebrow">Open</p>
        <AssignmentList items={open} />

        {finished.length > 0 && (
          <>
            <p className="eyebrow eyebrow--spaced">Finished</p>
            <AssignmentList items={finished} />
          </>
        )}
      </main>
    </>
  );
}
