import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ParentLinksService } from '@/lib/parent-links/service';
import { EnrollmentsService } from '@/lib/enrollments/service';
import { GradesService } from '@/lib/grades/service';
import { Roles } from '@/lib/rbac/roles';
import { getT } from '@/lib/i18n/server';
import { ApiError } from '@/lib/api/errors';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { childId: string };
}

export default async function ChildDetailPage({ params }: PageProps) {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };
  if (user.role !== Roles.PARENT && user.role !== Roles.ADMIN) {
    redirect('/dashboard');
  }

  const parentLinks = new ParentLinksService(prisma);
  try {
    await parentLinks.assertParentOf(params.childId, ctx);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      notFound();
    }
    throw err;
  }

  const child = await prisma.user.findUnique({
    where: { id: params.childId },
    select: {
      id: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      studentProfile: { select: { schoolName: true, gradeLevel: true } },
    },
  });
  if (!child) notFound();

  const enrollments = await new EnrollmentsService(prisma).listForStudent(params.childId);
  const grades = await new GradesService(prisma).listForStudent(params.childId, ctx);
  const activeEnrollments = enrollments.filter((e) => e.status === 'ACTIVE');
  const pendingEnrollments = enrollments.filter((e) => e.status === 'PENDING');

  // Build a per-course grade average for quick parent insight.
  const avgByCourse = computeAverages(grades);
  const t = getT();

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <Link href="/family" className="text-xs text-slate-500 hover:underline">
          ← {t('Familia')}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{child.fullName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {child.email}
          {child.studentProfile?.schoolName && ` · ${child.studentProfile.schoolName}`}
          {child.studentProfile?.gradeLevel && ` · ${child.studentProfile.gradeLevel}`}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          {t('Cursos activos ({n})', { n: activeEnrollments.length })}
        </h2>
        {activeEnrollments.length === 0 ? (
          <Card className="mt-3">
            <CardDescription>{t('Sin cursos activos.')}</CardDescription>
          </Card>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeEnrollments.map((e) =>
              e.course ? (
                <li key={e.id}>
                  <Link href={`/courses/${e.course.slug}`} className="block h-full">
                    <Card className="h-full transition hover:border-brand-400 hover:shadow-md">
                      <CardTitle>{e.course.title}</CardTitle>
                      <p className="mt-2 text-xs text-slate-500">
                        Prof. {e.course.teacher.fullName}
                      </p>
                      {avgByCourse[e.course.id] !== undefined && (
                        <p className="mt-3 text-sm">
                          {t('Media:')}{' '}
                          <span className="font-bold">{avgByCourse[e.course.id]!.toFixed(1)}</span>
                        </p>
                      )}
                    </Card>
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        )}
        {pendingEnrollments.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {t('{n} solicitud(es) de inscripción pendiente(s).', { n: pendingEnrollments.length })}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          {t('Calificaciones recientes ({n})', { n: grades.length })}
        </h2>
        {grades.length === 0 ? (
          <Card className="mt-3">
            <CardDescription>
              {t('{name} aún no tiene calificaciones.', { name: child.fullName })}
            </CardDescription>
          </Card>
        ) : (
          <div className="mt-3 space-y-3">
            {grades.slice(0, 20).map((g) => (
              <Card key={g.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">
                      <Badge variant="default">
                        {g.source.kind === 'submission' ? t('Tarea') : t('Cuestionario')}
                      </Badge>{' '}
                      · {g.courseTitle}
                    </p>
                    <h3 className="mt-1 font-semibold">
                      {g.source.kind === 'submission'
                        ? g.source.assignmentTitle
                        : g.source.quizTitle}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(g.gradedAt).toLocaleDateString('es', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      · {g.graderName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      {g.numericValue ?? g.conceptValue ?? g.letterValue}
                    </p>
                    <p className="text-xs text-slate-500">{g.scale}</p>
                  </div>
                </div>
                {g.feedback && (
                  <div className="mt-3 rounded-md border-l-4 border-brand-500 bg-slate-50 p-3 text-sm dark:bg-slate-800">
                    <p className="whitespace-pre-wrap">{g.feedback}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function computeAverages(
  grades: Array<{ courseId: string; numericValue: number | null }>,
): Record<string, number> {
  const buckets: Record<string, { sum: number; count: number }> = {};
  for (const g of grades) {
    if (g.numericValue == null) continue;
    const b = (buckets[g.courseId] ??= { sum: 0, count: 0 });
    b.sum += g.numericValue;
    b.count += 1;
  }
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(buckets)) {
    if (v.count > 0) result[k] = v.sum / v.count;
  }
  return result;
}
