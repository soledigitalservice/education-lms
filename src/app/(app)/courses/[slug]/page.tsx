import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EnrollmentStatus } from '@prisma/client';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { ApiError } from '@/lib/api/errors';
import { ModulesService, type ModuleDto } from '@/lib/modules/service';
import { LessonsService, type LessonDto } from '@/lib/lessons/service';
import { MaterialsService, type MaterialDto } from '@/lib/materials/service';
import { LessonProgressService, type LessonProgressDto } from '@/lib/lesson-progress/service';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MaterialList } from '@/components/material-list';
import { AddMaterialForm } from '@/components/add-material-form';
import { TeacherReviewsPanel } from '@/components/teacher-reviews-panel';
import { LiveSessionsPanel } from '@/components/live-sessions-panel';
import { Roles } from '@/lib/rbac/roles';
import { getT, getLocale } from '@/lib/i18n/server';
import { EnrollmentActions } from './enrollment-actions';
import { CourseAdminActions } from './course-admin-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function CourseDetailPage({ params }: PageProps) {
  const user = await requireSession();
  const t = getT();
  const locale = getLocale();
  const ctx = { userId: user.id, role: user.role };

  const courses = new CoursesService(prisma);
  let course;
  try {
    course = await courses.getByIdOrSlug(params.slug, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const isOwner = course.teacher.id === user.id;
  const isAdmin = user.role === Roles.ADMIN;
  const canManage = isOwner || isAdmin;

  // Look up current student's enrollment status, if any.
  let myEnrollmentStatus: string | null = null;
  if (user.role === Roles.STUDENT) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId: course.id, studentId: user.id } },
      select: { status: true },
    });
    myEnrollmentStatus = enrollment?.status ?? null;
  }

  // Pending count for the teacher/admin nav badge.
  let pendingCount = 0;
  if (canManage) {
    pendingCount = await prisma.enrollment.count({
      where: { courseId: course.id, status: 'PENDING' },
    });
  }

  // Curriculum + bibliography visibility:
  //   - manager (owner/admin) always sees
  //   - enrolled student (ACTIVE/COMPLETED) sees
  //   - everyone else sees neither
  const enrolledAsStudent =
    user.role === Roles.STUDENT &&
    myEnrollmentStatus !== null &&
    [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED].includes(
      myEnrollmentStatus as EnrollmentStatus,
    );
  const canReadContent = canManage || enrolledAsStudent;

  // Load curriculum + bibliography in parallel (only when authorised).
  let moduleRows: ModuleDto[] = [];
  let lessonsByModule: Record<string, LessonDto[]> = {};
  let bibliography: MaterialDto[] = [];
  if (canReadContent) {
    const modulesSvc = new ModulesService(prisma);
    const lessonsSvc = new LessonsService(prisma);
    const materialsSvc = new MaterialsService(prisma);

    moduleRows = await modulesSvc.listForCourse(course.id);
    [lessonsByModule, bibliography] = await Promise.all([
      Promise.all(
        moduleRows.map(async (m) => [m.id, await lessonsSvc.listForModule(m.id, ctx)] as const),
      ).then((entries) => Object.fromEntries(entries)),
      materialsSvc.listForCourse(course.id, ctx),
    ]);
  }
  const hasContent = moduleRows.some((m) => (lessonsByModule[m.id]?.length ?? 0) > 0);

  // Student progress across this course (for checkmarks + a progress bar).
  let progressMap = new Map<string, LessonProgressDto>();
  if (enrolledAsStudent) {
    progressMap = await new LessonProgressService(prisma).mapForCourseStudent(course.id, user.id);
  }
  const visibleLessons = Object.values(lessonsByModule).flat();
  const completedLessons = visibleLessons.filter(
    (l) => progressMap.get(l.id)?.completedAt,
  ).length;
  const progressPct =
    visibleLessons.length > 0
      ? Math.round((completedLessons / visibleLessons.length) * 100)
      : 0;

  return (
    <>
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {course.category && <Badge variant="brand">{course.category.name}</Badge>}
            {!course.publishedAt && <Badge variant="warning">{t('Borrador')}</Badge>}
            {course.archivedAt && <Badge variant="default">{t('Archivado')}</Badge>}
          </div>
          <h1 className="mt-3 text-3xl font-bold">{course.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t('Por')} {course.teacher.fullName} ·{' '}
            {t('{n} alumno(s) activo(s)', { n: course.studentCount })}
            {course.maxStudents ? ` / ${course.maxStudents}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Link href={`/courses/${course.slug}/curriculum`}>
                <Button variant="secondary">{t('Currículum')}</Button>
              </Link>
              <Link href={`/courses/${course.slug}/analytics`}>
                <Button variant="secondary">{t('Analítica')}</Button>
              </Link>
              <Link href={`/courses/${course.slug}/students`}>
                <Button variant="secondary">
                  {t('Alumnos')}{' '}
                  {pendingCount > 0 && (
                    <Badge variant="warning" className="ml-2">
                      {pendingCount}
                    </Badge>
                  )}
                </Button>
              </Link>
              <Link href={`/courses/${course.slug}/forum`}>
                <Button variant="secondary">{t('Foro')}</Button>
              </Link>
              <Link href={`/courses/${course.slug}/edit`}>
                <Button variant="secondary">{t('Editar')}</Button>
              </Link>
              <CourseAdminActions course={course} />
            </>
          )}
          {!canManage && enrolledAsStudent && (
            <Link href={`/courses/${course.slug}/forum`}>
              <Button variant="secondary">{t('Foro')}</Button>
            </Link>
          )}
          {user.role === Roles.STUDENT && course.publishedAt && !course.archivedAt && (
            <EnrollmentActions courseSlug={course.slug} myStatus={myEnrollmentStatus} />
          )}
        </div>
      </header>

      {canReadContent && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('Contenido del curso')}</h2>
          {enrolledAsStudent && visibleLessons.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {t('Tu progreso')}
                </span>
                <span className="text-slate-500">
                  {t('{c} de {t} lecciones', { c: completedLessons, t: visibleLessons.length })} ·{' '}
                  {progressPct}%
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
          <div className="mt-4 space-y-3">
            {moduleRows.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">
                  {t('El profesor aún no ha publicado módulos.')}
                </p>
              </Card>
            ) : !hasContent && !canManage ? (
              <Card>
                <p className="text-sm text-slate-500">
                  {t('El profesor está preparando las lecciones. Vuelve pronto.')}
                </p>
              </Card>
            ) : (
              moduleRows.map((m) => {
                const lessons = lessonsByModule[m.id] ?? [];
                if (lessons.length === 0 && !canManage) return null;
                return (
                  <Card key={m.id}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        {t('Módulo {n}', { n: m.position })}
                      </span>
                      {!m.publishedAt && <Badge variant="warning">{t('Borrador')}</Badge>}
                    </div>
                    <h3 className="mt-1 text-base font-semibold">{m.title}</h3>
                    {m.description && (
                      <p className="mt-1 text-sm text-slate-500">{m.description}</p>
                    )}
                    {lessons.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">{t('Sin lecciones todavía.')}</p>
                    ) : (
                      <ol className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                        {lessons.map((l) => (
                          <li key={l.id} className="py-2">
                            <Link
                              href={`/courses/${course.slug}/lessons/${l.id}`}
                              className="flex items-center justify-between gap-3 text-sm hover:text-brand-600"
                            >
                              <span className="flex items-center gap-2">
                                {progressMap.get(l.id)?.completedAt ? (
                                  <span
                                    className="font-semibold text-emerald-600"
                                    title={t('Completada')}
                                  >
                                    ✓
                                  </span>
                                ) : (
                                  <span className="font-mono text-xs text-slate-400">
                                    {l.position}
                                  </span>
                                )}
                                {l.title}
                              </span>
                              <span className="flex items-center gap-2">
                                <Badge variant="default">{l.type}</Badge>
                                {!l.publishedAt && canManage && (
                                  <Badge variant="warning">{t('Borrador')}</Badge>
                                )}
                                {l.materialCount > 0 && (
                                  <span className="text-xs text-slate-500">
                                    {t('{n} material(es)', { n: l.materialCount })}
                                  </span>
                                )}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardTitle>{t('Sobre el curso')}</CardTitle>
            {course.summary && (
              <CardDescription className="mt-2 text-base">{course.summary}</CardDescription>
            )}
            {course.description ? (
              <div className="prose prose-slate mt-6 max-w-none whitespace-pre-wrap text-sm dark:prose-invert">
                {course.description}
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">{t('Sin descripción todavía.')}</p>
            )}
          </Card>

          {canReadContent && (
            <Card>
              <CardTitle>{t('Bibliografía y recursos')}</CardTitle>
              <div className="mt-4">
                <MaterialList items={bibliography} canManage={canManage} />
              </div>
              {canManage && (
                <div className="mt-4">
                  <AddMaterialForm target={{ kind: 'course', courseSlug: course.slug }} />
                </div>
              )}
            </Card>
          )}

          {canReadContent && (
            <LiveSessionsPanel courseSlug={course.slug} canManage={canManage} />
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardTitle>{t('Detalles')}</CardTitle>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label={t('Idioma')} value={course.language.toUpperCase()} />
              <Row
                label={t('Inscripción')}
                value={
                  course.requiresApproval
                    ? t('Aprobación del profesor')
                    : t('Inscripción directa')
                }
              />
              {course.startsAt && <Row label={t('Empieza')} value={fmtDate(course.startsAt, locale)} />}
              {course.endsAt && <Row label={t('Termina')} value={fmtDate(course.endsAt, locale)} />}
              {course.publishedAt && (
                <Row label={t('Publicado')} value={fmtDate(course.publishedAt, locale)} />
              )}
            </dl>
          </Card>

          <TeacherReviewsPanel
            teacherId={course.teacher.id}
            teacherName={course.teacher.fullName}
            courseId={course.id}
            canReview={
              (user.role === Roles.STUDENT &&
                myEnrollmentStatus !== null &&
                [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED].includes(
                  myEnrollmentStatus as EnrollmentStatus,
                )) ||
              user.role === Roles.PARENT
            }
            currentUserId={user.id}
          />
        </aside>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
