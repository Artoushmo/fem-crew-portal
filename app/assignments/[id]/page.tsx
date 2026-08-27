import { AssignmentDetail } from '@/components/AssignmentDetail';
import { assignments } from '@/lib/assignments';

/** Only the sample ids can be known ahead of time, and they are what the static
    export needs. A real id is a role's uuid, which exists solely in the
    database, so the page is rendered on demand for anything not in this list. */
export function generateStaticParams() {
  return assignments.map((a) => ({ id: a.id }));
}

export default function AssignmentPage({ params }: { params: { id: string } }) {
  // Deliberately no notFound() here. This used to check the id against the
  // sample set, which turned every real booking into a 404 -- the assignment
  // existed, the build just had never heard of it. Whether the row is there is
  // a question only the client can answer, and it says so itself.
  return <AssignmentDetail id={params.id} />;
}
