import { notFound } from 'next/navigation';
import { AssignmentDetail } from '@/components/AssignmentDetail';
import { assignments, getAssignment } from '@/lib/assignments';

export function generateStaticParams() {
  return assignments.map((a) => ({ id: a.id }));
}

/** Static shell: the id is baked in at build time, the content reads live
    progress from the client store. */
export default function AssignmentPage({ params }: { params: { id: string } }) {
  if (!getAssignment(params.id)) notFound();
  return <AssignmentDetail id={params.id} />;
}
