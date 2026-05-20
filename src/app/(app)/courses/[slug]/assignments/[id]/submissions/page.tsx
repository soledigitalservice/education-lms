import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { AssignmentsService } from '@/lib/assignments/service';
import { SubmissionsService } from '@/lib/submissions/service';
import { ApiError } from '@/lib/api/errors';
import { Roles } from '@/lib/rbac/roles';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string; id: string };
}

export default async function AssignmentSubmissionsPage({ params }: PageProps) {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };
  const assignments = new AssignmentsService(prisma);

  let assignment;
  try {
    assignment = await assignments.getById(params.id, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Teachers and admins only.
  const course = await prisma.course.findUnique({
    where: { id: assignment.courseId },
    select: { teacherId: true, slug: true },
  });
  if (!course) notFound();
  if (user.role !== Roles.ADMIN && course.teacherId !== user.id) {
    redirect(`/courses/${course.slug}`);
  }

  const submissions = new SubmissionsService(prisma);
  const all = await submissions.listForAssignment(assignment.id, ctx);
  const pending = all.filter((s) => s.status === 'SUBMITTED' || s.status === 'LATE');
  const graded = all.filter((s) => s.status === 'GRADED');
  const returned = all.filter((s) => s.status === 'RETURNED');
  const drafts = all.filter((s) => s.status === 'DRAFT');

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <Link
          href={`/courses/${params.slug}`}
          className="text-xs text-slate-500 hover:underline"
        >
          ← Curso
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Entregas · {assignment.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Total: {all.length} · Pendientes de calificar: {pending.length} · Calificadas: {graded.length}
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <Section title="Pendientes de calificación" items={pending} courseSlug={params.slug} />
        <Section title="Calificadas" items={graded} courseSlug={params.slug} />
        <Section title="Devueltas para revisión" items={returned} courseSlug={params.slug} />
        <Section title="Borradores (no entregadas)" items={drafts} courseSlug={params.slug} />
      </div>
    </>
  );
}

function Section({
  title,
  items,
  courseSlug,
}: {
  title: string;
  items: Array<{
    id: string;
    student: { fullName: string; email: string };
    status: string;
    submittedAt: string | null;
    isLate: boolean;
    files: Array<{ id: string }>;
    grade: null | { numericValue: number | null; conceptValue: string | null; letterValue: string | null };
  }>;
  courseSlug: string;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardTitle>{title} ({items.length})</CardTitle>
      <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
        {items.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{s.student.fullName}</p>
              <p className="text-xs text-slate-500">
                {s.student.email} · {s.files.length} archivo(s){' '}
                {s.submittedAt &&
                  `· entregada ${new Date(s.submittedAt).toLocaleString('es')}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {s.isLate && <Badge variant="warning">Tardía</Badge>}
              {s.grade && (
                <span className="text-sm font-medium">
                  {s.grade.numericValue ?? s.grade.conceptValue ?? s.grade.letterValue}
                </span>
              )}
              <Link
                href={`/courses/${courseSlug}/submissions/${s.id}`}
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                {s.status === 'GRADED' ? 'Revisar →' : 'Calificar →'}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
