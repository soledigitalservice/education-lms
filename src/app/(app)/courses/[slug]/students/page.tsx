import { notFound, redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { EnrollmentsService } from '@/lib/enrollments/service';
import { Roles } from '@/lib/rbac/roles';
import { ApiError } from '@/lib/api/errors';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EnrollmentRowActions } from './enrollment-row-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function CourseStudentsPage({ params }: PageProps) {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };
  const courses = new CoursesService(prisma);

  let course;
  try {
    course = await courses.getByIdOrSlug(params.slug, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  if (user.role !== Roles.ADMIN && course.teacher.id !== user.id) {
    redirect(`/courses/${course.slug}`);
  }

  const enrollments = new EnrollmentsService(prisma);
  const all = await enrollments.listForCourse(course.id, undefined, ctx);
  const pending = all.filter((e) => e.status === 'PENDING');
  const active = all.filter((e) => e.status === 'ACTIVE');
  const other = all.filter((e) => !['PENDING', 'ACTIVE'].includes(e.status));

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Alumnos · {course.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {active.length} activo(s) · {pending.length} pendiente(s) · {other.length} histórico
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Solicitudes pendientes</CardTitle>
            <Badge variant={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>
          </div>
          {pending.length === 0 ? (
            <CardDescription className="mt-3">No hay solicitudes pendientes.</CardDescription>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {pending.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{e.student.fullName}</p>
                    <p className="text-xs text-slate-500">{e.student.email}</p>
                  </div>
                  <EnrollmentRowActions enrollmentId={e.id} kind="pending" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Alumnos activos</CardTitle>
            <Badge variant="default">{active.length}</Badge>
          </div>
          {active.length === 0 ? (
            <CardDescription className="mt-3">Aún no hay alumnos activos.</CardDescription>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {active.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{e.student.fullName}</p>
                    <p className="text-xs text-slate-500">{e.student.email}</p>
                  </div>
                  <EnrollmentRowActions enrollmentId={e.id} kind="active" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {other.length > 0 && (
          <Card>
            <CardTitle>Histórico</CardTitle>
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {other.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{e.student.fullName}</p>
                    <p className="text-xs text-slate-500">{e.student.email}</p>
                  </div>
                  <Badge
                    variant={
                      e.status === 'COMPLETED' ? 'success' : e.status === 'REJECTED' ? 'danger' : 'default'
                    }
                  >
                    {e.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
