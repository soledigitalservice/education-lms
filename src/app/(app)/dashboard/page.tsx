import Link from 'next/link';
import { Role, EnrollmentStatus, SubmissionStatus, LiveSessionStatus } from '@prisma/client';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { RecentGradesPager } from './recent-grades-pager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/lib/rbac/roles';
import { getT, getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireSession();
  const t = getT();
  const locale = getLocale();

  // Friendly localized date string.
  const now = new Date();
  const dateLabel = now.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          {t(ROLE_LABELS[user.role])}
        </p>
        <h1 className="mt-1 text-3xl font-bold">
          {t(greeting(now))}, {user.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm capitalize text-slate-500">{dateLabel}</p>
      </header>

      <div className="mt-8 space-y-8">
        {user.role === Role.TEACHER && <TeacherDashboard userId={user.id} />}
        {user.role === Role.STUDENT && <StudentDashboard userId={user.id} />}
        {user.role === Role.PARENT && <ParentDashboard userId={user.id} />}
        {user.role === Role.ADMIN && <AdminDashboard />}
      </div>
    </>
  );
}

// ============================================================================
// TEACHER
// ============================================================================

async function TeacherDashboard({ userId }: { userId: string }) {
  const t = getT();
  const [
    activeCourses,
    draftCourses,
    totalStudents,
    pendingEnrollments,
    pendingGrading,
    upcomingSessions,
  ] = await Promise.all([
    prisma.course.count({
      where: { teacherId: userId, publishedAt: { not: null }, archivedAt: null, deletedAt: null },
    }),
    prisma.course.count({
      where: { teacherId: userId, publishedAt: null, deletedAt: null },
    }),
    prisma.enrollment.count({
      where: { course: { teacherId: userId }, status: EnrollmentStatus.ACTIVE },
    }),
    prisma.enrollment.findMany({
      where: { course: { teacherId: userId }, status: EnrollmentStatus.PENDING },
      take: 5,
      orderBy: { requestedAt: 'asc' },
      include: {
        course: { select: { slug: true, title: true } },
        student: { select: { fullName: true, email: true } },
      },
    }),
    prisma.submission.findMany({
      where: {
        assignment: { course: { teacherId: userId } },
        status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.LATE] },
      },
      take: 5,
      orderBy: { submittedAt: 'asc' },
      include: {
        student: { select: { fullName: true } },
        assignment: {
          select: { id: true, title: true, course: { select: { slug: true } } },
        },
      },
    }),
    prisma.liveSession.findMany({
      where: {
        hostId: userId,
        status: { in: [LiveSessionStatus.SCHEDULED, LiveSessionStatus.LIVE] },
        scheduledStart: { gte: new Date() },
      },
      take: 3,
      orderBy: { scheduledStart: 'asc' },
      include: { course: { select: { slug: true, title: true } } },
    }),
  ]);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('Cursos publicados')} value={activeCourses} subtitle={t('{n} en borrador', { n: draftCourses })} />
        <Stat label={t('Alumnos activos')} value={totalStudents} subtitle={t('en todos tus cursos')} />
        <Stat
          label={t('Pendientes de calificar')}
          value={pendingGrading.length}
          subtitle={pendingGrading.length === 0 ? t('al día') : t('requieren tu atención')}
          highlight={pendingGrading.length > 0}
        />
        <Stat
          label={t('Solicitudes de inscripción')}
          value={pendingEnrollments.length}
          subtitle={pendingEnrollments.length === 0 ? t('sin pendientes') : t('esperando aprobación')}
          highlight={pendingEnrollments.length > 0}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <QuickActions
          role="teacher"
          items={[
            { href: '/courses/new', label: t('+ Nuevo curso'), primary: true },
            { href: '/my/courses', label: t('Mis cursos') },
            { href: '/calendar', label: t('Calendario') },
            { href: '/messages', label: t('Mensajes') },
          ]}
        />

        <Card className="lg:col-span-2">
          <CardTitle>{t('Próximas clases en vivo')}</CardTitle>
          {upcomingSessions.length === 0 ? (
            <CardDescription className="mt-3">
              {t('No tienes clases programadas. Crea una desde la página del curso.')}
            </CardDescription>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {upcomingSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="text-xs text-slate-500">
                      {s.course.title} ·{' '}
                      {new Date(s.scheduledStart).toLocaleString('es', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                  <Link
                    href={`/courses/${s.course.slug}/live/${s.id}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    {s.status === LiveSessionStatus.LIVE ? t('Entrar ahora →') : t('Ver →')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {pendingEnrollments.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Solicitudes de inscripción pendientes')}</CardTitle>
            <Badge variant="warning">{pendingEnrollments.length}</Badge>
          </div>
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {pendingEnrollments.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.student.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {e.student.email} · {t('solicitó acceso a')}{' '}
                    <span className="font-medium">{e.course.title}</span>
                  </p>
                </div>
                <Link
                  href={`/courses/${e.course.slug}/students`}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  {t('Revisar →')}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pendingGrading.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Entregas pendientes de calificar')}</CardTitle>
            <Badge variant="warning">{pendingGrading.length}</Badge>
          </div>
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {pendingGrading.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.assignment.title}</p>
                  <p className="text-xs text-slate-500">
                    {t('Entregado por {name}', { name: s.student.fullName })}
                    {s.status === SubmissionStatus.LATE && (
                      <Badge variant="warning" className="ml-2">
                        {t('Tardía')}
                      </Badge>
                    )}
                  </p>
                </div>
                <Link
                  href={`/courses/${s.assignment.course.slug}/submissions/${s.id}`}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  {t('Calificar →')}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

// ============================================================================
// STUDENT
// ============================================================================

async function StudentDashboard({ userId }: { userId: string }) {
  const t = getT();
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [activeEnrollments, dueSoon, recentGrades, upcomingSessions] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: userId, status: EnrollmentStatus.ACTIVE },
      include: {
        course: {
          select: { id: true, slug: true, title: true, teacher: { select: { fullName: true } } },
        },
      },
      orderBy: { decidedAt: 'desc' },
    }),
    prisma.assignment.findMany({
      where: {
        publishedAt: { not: null },
        dueAt: { gte: now, lte: in7Days },
        course: {
          enrollments: {
            some: { studentId: userId, status: EnrollmentStatus.ACTIVE },
          },
        },
      },
      take: 5,
      orderBy: { dueAt: 'asc' },
      include: {
        course: { select: { slug: true, title: true } },
        submissions: { where: { studentId: userId }, select: { status: true } },
      },
    }),
    prisma.grade.findMany({
      where: { studentId: userId },
      take: 20,
      orderBy: { gradedAt: 'desc' },
      include: {
        submission: {
          select: { assignment: { select: { title: true, maxScore: true } } },
        },
      },
    }),
    prisma.liveSession.findMany({
      where: {
        status: { in: [LiveSessionStatus.SCHEDULED, LiveSessionStatus.LIVE] },
        scheduledStart: { gte: now, lte: in7Days },
        course: {
          enrollments: {
            some: { studentId: userId, status: EnrollmentStatus.ACTIVE },
          },
        },
      },
      take: 3,
      orderBy: { scheduledStart: 'asc' },
      include: { course: { select: { slug: true, title: true } } },
    }),
  ]);

  // Per-course progress for the "Continuar aprendiendo" cards.
  const courseIds = activeEnrollments.map((e) => e.course.id);
  const [lessonsAll, progressAll] = await Promise.all([
    courseIds.length
      ? prisma.lesson.findMany({
          where: {
            publishedAt: { not: null },
            module: { courseId: { in: courseIds }, publishedAt: { not: null } },
          },
          select: { id: true, position: true, module: { select: { courseId: true, position: true } } },
        })
      : Promise.resolve([]),
    courseIds.length
      ? prisma.lessonProgress.findMany({
          where: { studentId: userId, lesson: { module: { courseId: { in: courseIds } } } },
          select: { lessonId: true, completedAt: true },
        })
      : Promise.resolve([]),
  ]);
  const completedSet = new Set(
    progressAll.filter((p) => p.completedAt != null).map((p) => p.lessonId),
  );
  const progressByCourse = new Map<
    string,
    { total: number; completed: number; nextLessonId: string | null }
  >();
  for (const cid of courseIds) {
    const ls = lessonsAll
      .filter((l) => l.module.courseId === cid)
      .sort((a, b) => a.module.position - b.module.position || a.position - b.position);
    const completed = ls.filter((l) => completedSet.has(l.id)).length;
    const next = ls.find((l) => !completedSet.has(l.id))?.id ?? null;
    progressByCourse.set(cid, { total: ls.length, completed, nextLessonId: next });
  }

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('Cursos activos')} value={activeEnrollments.length} />
        <Stat
          label={t('Entregas próximas')}
          value={dueSoon.length}
          subtitle={t('en los próximos 7 días')}
          highlight={dueSoon.length > 0}
        />
        <Stat label={t('Notas recibidas')} value={recentGrades.length} subtitle={t('recientes')} />
        <Stat label={t('Clases en vivo')} value={upcomingSessions.length} subtitle={t('esta semana')} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <QuickActions
          role="student"
          items={[
            { href: '/my/courses', label: t('Mis cursos'), primary: true },
            { href: '/my/grades', label: t('Mis notas') },
            { href: '/calendar', label: t('Calendario') },
            { href: '/messages', label: t('Mensajes') },
          ]}
        />

        <Card className="lg:col-span-2">
          <CardTitle>{t('Próximas entregas')}</CardTitle>
          {dueSoon.length === 0 ? (
            <CardDescription className="mt-3">
              {t('¡Nada vence en los próximos 7 días! Aprovecha para repasar materiales.')}
            </CardDescription>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {dueSoon.map((a) => {
                const submitted = a.submissions.length > 0;
                const hoursLeft = a.dueAt
                  ? Math.max(0, Math.round((a.dueAt.getTime() - now.getTime()) / (60 * 60 * 1000)))
                  : 0;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.title}</p>
                      <p className="text-xs text-slate-500">
                        {a.course.title} · {t('vence en {h}h', { h: hoursLeft })}
                        {submitted && (
                          <Badge variant="success" className="ml-2">
                            {t('Entregada')}
                          </Badge>
                        )}
                      </p>
                    </div>
                    <Link
                      href={`/courses/${a.course.slug}${a.lessonId ? `/lessons/${a.lessonId}` : ''}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {submitted ? t('Ver →') : t('Entregar →')}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Notas')}</CardTitle>
            <Link
              href="/my/grades"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              {t('Ver todas →')}
            </Link>
          </div>
          <RecentGradesPager grades={recentGrades} />
        </Card>

        <Card>
          <CardTitle>{t('Próximas clases en vivo')}</CardTitle>
          {upcomingSessions.length === 0 ? (
            <CardDescription className="mt-3">
              {t('No hay clases programadas esta semana.')}
            </CardDescription>
          ) : (
            <ul className="mt-4 space-y-2">
              {upcomingSessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/courses/${s.course.slug}/live/${s.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm transition hover:border-brand-300 dark:border-slate-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.title}</span>
                      <span className="text-xs text-slate-500">
                        {s.course.title} ·{' '}
                        {new Date(s.scheduledStart).toLocaleString('es', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </span>
                    {s.status === LiveSessionStatus.LIVE && <Badge variant="brand">{t('EN VIVO')}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {activeEnrollments.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t('Continuar aprendiendo')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeEnrollments.slice(0, 6).map((e) => {
              const p = progressByCourse.get(e.course.id) ?? {
                total: 0,
                completed: 0,
                nextLessonId: null,
              };
              const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
              const done = p.total > 0 && p.completed >= p.total;
              const href = p.nextLessonId
                ? `/courses/${e.course.slug}/lessons/${p.nextLessonId}`
                : `/courses/${e.course.slug}`;
              const cta = done ? t('Repasar curso') : p.completed > 0 ? t('Continuar') : t('Empezar');
              return (
                <Card key={e.id} className="flex h-full flex-col">
                  <CardTitle>{e.course.title}</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">Prof. {e.course.teacher.fullName}</p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {p.total > 0
                          ? t('{c}/{t} lecciones', { c: p.completed, t: p.total })
                          : t('Sin lecciones aún')}
                      </span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex-1" />
                  <Link href={href} className="mt-4">
                    <Button
                      variant={done ? 'secondary' : 'primary'}
                      size="sm"
                      className="w-full justify-center"
                    >
                      {cta}
                    </Button>
                  </Link>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

// ============================================================================
// PARENT
// ============================================================================

async function ParentDashboard({ userId }: { userId: string }) {
  const t = getT();
  const [approvedLinks, pendingInvites] = await Promise.all([
    prisma.parentChildLink.findMany({
      where: { parentId: userId, status: 'APPROVED' },
      include: {
        child: {
          select: {
            id: true,
            fullName: true,
            email: true,
            _count: {
              select: {
                enrollments: { where: { status: EnrollmentStatus.ACTIVE } },
              },
            },
          },
        },
      },
    }),
    prisma.parentChildLink.count({
      where: { parentId: userId, status: 'PENDING' },
    }),
  ]);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label={t('Hijos vinculados')} value={approvedLinks.length} />
        <Stat
          label={t('Invitaciones pendientes')}
          value={pendingInvites}
          subtitle={t('esperando aprobación del hijo')}
          highlight={pendingInvites > 0}
        />
        <Stat
          label={t('Cursos seguidos')}
          value={approvedLinks.reduce((acc, l) => acc + l.child._count.enrollments, 0)}
          subtitle={t('entre todos tus hijos')}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <QuickActions
          role="parent"
          items={[
            { href: '/family', label: t('Familia'), primary: true },
            { href: '/calendar', label: t('Calendario') },
            { href: '/messages', label: t('Mensajes') },
          ]}
        />

        <Card className="lg:col-span-2">
          <CardTitle>{t('Tus hijos')}</CardTitle>
          {approvedLinks.length === 0 ? (
            <CardDescription className="mt-3">
              {t('Aún no tienes vínculos aprobados. Ve a')}{' '}
              <Link href="/family" className="font-medium text-brand-600 hover:underline">
                {t('Familia')}
              </Link>{' '}
              {t('para enviar una invitación a la cuenta de tu hijo.')}
            </CardDescription>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {approvedLinks.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.child.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {l.child.email} ·{' '}
                      {t('{n} curso(s) activo(s)', { n: l.child._count.enrollments })}
                    </p>
                  </div>
                  <Link
                    href={`/family/${l.child.id}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    {t('Ver panel →')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}

// ============================================================================
// ADMIN
// ============================================================================

async function AdminDashboard() {
  const t = getT();
  const [
    totalUsers,
    pendingTeachers,
    activeCourses,
    draftCourses,
    activeEnrollments,
    submissionsToday,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({
      where: { role: Role.TEACHER, status: 'PENDING_APPROVAL', deletedAt: null },
    }),
    prisma.course.count({
      where: { publishedAt: { not: null }, archivedAt: null, deletedAt: null },
    }),
    prisma.course.count({
      where: { publishedAt: null, archivedAt: null, deletedAt: null },
    }),
    prisma.enrollment.count({ where: { status: EnrollmentStatus.ACTIVE } }),
    prisma.submission.count({
      where: {
        submittedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        status: { not: SubmissionStatus.DRAFT },
      },
    }),
  ]);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t('Usuarios totales')} value={totalUsers} />
        <Stat
          label={t('Profesores pendientes')}
          value={pendingTeachers}
          subtitle={t('esperando aprobación')}
          highlight={pendingTeachers > 0}
        />
        <Stat
          label={t('Cursos publicados')}
          value={activeCourses}
          subtitle={t('{n} en borrador', { n: draftCourses })}
        />
        <Stat label={t('Inscripciones activas')} value={activeEnrollments} />
        <Stat
          label={t('Entregas (24h)')}
          value={submissionsToday}
          subtitle={t('actividad reciente')}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <QuickActions
          role="admin"
          items={[
            { href: '/admin/users', label: t('Gestionar usuarios'), primary: true },
            { href: '/admin/categories', label: t('Categorías') },
            { href: '/admin/stats', label: t('Estadísticas') },
            { href: '/courses', label: t('Catálogo') },
          ]}
        />

        <Card>
          <CardTitle>{t('Salud de la plataforma')}</CardTitle>
          <CardDescription className="mt-2">
            {t('Estadísticas detalladas y métricas de engagement están disponibles en')}{' '}
            <Link
              href="/admin/stats"
              className="font-medium text-brand-600 hover:underline"
            >
              {t('el panel completo')}
            </Link>
            {t(': usuarios por rol, cursos por estado, actividad en tiempo real, audit log, etc.')}
          </CardDescription>
        </Card>
      </section>

      {pendingTeachers > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Atención requerida')}</CardTitle>
            <Badge variant="warning">{pendingTeachers}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {t('Hay {n} profesor(es) esperando que apruebes su cuenta.', { n: pendingTeachers })}
          </p>
          <Link href="/admin/users" className="mt-3 inline-block">
            <Button variant="primary" size="sm">
              {t('Revisar solicitudes →')}
            </Button>
          </Link>
        </Card>
      )}
    </>
  );
}

// ============================================================================
// Shared components
// ============================================================================

function Stat({
  label,
  value,
  subtitle,
  highlight,
}: {
  label: string;
  value: number;
  subtitle?: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={
          'mt-2 text-3xl font-bold ' +
          (highlight && value > 0
            ? 'text-amber-600'
            : 'text-slate-900 dark:text-slate-100')
        }
      >
        {value.toLocaleString('es')}
      </p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </Card>
  );
}

function QuickActions({
  items,
}: {
  role: 'teacher' | 'student' | 'parent' | 'admin';
  items: Array<{ href: string; label: string; primary?: boolean }>;
}) {
  return (
    <Card>
      <CardTitle>Atajos</CardTitle>
      <div className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={item.primary ? 'primary' : 'secondary'}
              className="w-full justify-start"
              size="sm"
            >
              {item.label}
            </Button>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
