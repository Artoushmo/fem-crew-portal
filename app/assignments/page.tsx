import { AssignmentList } from '@/components/AssignmentList';
import { Masthead } from '@/components/Masthead';
import { past, upcoming } from '@/lib/assignments';

export default function AssignmentsPage() {
  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Assignments</h1>
        <p className="hero__sub">
          {upcoming.length} upcoming · {past.length} completed
        </p>
      </Masthead>

      <main className="content">
        <p className="eyebrow">Upcoming</p>
        <AssignmentList items={upcoming} />

        <p className="eyebrow eyebrow--spaced">Completed</p>
        <AssignmentList items={past} />
      </main>
    </>
  );
}
