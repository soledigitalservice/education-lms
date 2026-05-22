import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { CourseAnalyticsService, type CourseAnalytics } from '@/lib/analytics/course-service';
import { Roles } from '@/lib/rbac/roles';
import { getT } from '@/lib/i18n/server';
import { ApiError } from '@/lib/api/errors';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function CourseAnalyticsPage({ params }: PageProps) {
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

  // Analytics are owner/admin only — students never see them.
  if (user.role !== Roles.ADMIN && course.teacher.id !== user.id) {
    redirect(`/courses/${course.slug}`);
  }

  const data = await new CourseAnalyticsService(prisma).getCourseAnalytics(course.id);
  const t = getT();

  return (
    <>
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-6 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href={`/courses/${course.slug}`}
            className="text-xs text-slate-500 hover:underline"
          >
            {t('← Volver al curso')}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{t('Analítica')} · {course.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('Métricas en tiempo real de participación, entregas y rendimiento.')}
          </p>
        </div>
      </header>

      <KpiGrid data={data} />

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GradeDistribution data={data} />
        </div>
        <EnrollmentFunnel data={data} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EvaluationsTable data={data} />
        </div>
        <EnrollmentWeekly data={data} />
      </section>

      <section className="mt-8">
        <LessonCompletion data={data} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <LiveAttendance data={data} />
        <ActivityChart data={data} />
      </section>
    </>
  );
}

// ===========================================================================
//  KPI cards
// ===========================================================================

function KpiGrid({ data }: { data: CourseAnalytics }) {
  const t = getT();
  const o = data.overview;
  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        label={t('Alumnos activos')}
        value={String(o.activeStudents)}
        subtitle={t('{c} completados · {p} pendientes', {
          c: o.completedStudents,
          p: o.pendingRequests,
        })}
      />
      <Kpi
        label={t('Finalización media')}
        value={o.avgCompletionPct == null ? '—' : `${o.avgCompletionPct}%`}
        subtitle={
          o.publishedLessons === 0
            ? t('Sin lecciones publicadas')
            : t('{f} al 100% · {n} lecciones', { f: o.fullyComplete, n: o.publishedLessons })
        }
      />
      <Kpi
        label={t('Nota media')}
        value={o.avgGradePct == null ? '—' : `${o.avgGradePct}%`}
        subtitle={t('{n} calificación(es)', { n: o.gradedCount })}
      />
      <Kpi
        label={t('Bajas / rechazos')}
        value={String(o.droppedOrRejected)}
        subtitle={t('Inscripciones no activas')}
        highlight={o.droppedOrRejected > 0}
      />
    </section>
  );
}

function Kpi({
  label,
  value,
  subtitle,
  highlight,
}: {
  label: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={
          'mt-2 text-3xl font-bold ' +
          (highlight ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100')
        }
      >
        {value}
      </p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </Card>
  );
}

// ===========================================================================
//  Grade distribution histogram
// ===========================================================================

function GradeDistribution({ data }: { data: CourseAnalytics }) {
  const t = getT();
  const { distribution, avgPct, medianPct, count } = data.grades;
  const max = Math.max(1, ...distribution.map((b) => b.count));
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <CardTitle>{t('Distribución de calificaciones')}</CardTitle>
        <span className="text-xs text-slate-500">
          {count > 0
            ? t('media {a}% · mediana {m}%', { a: avgPct ?? 0, m: medianPct ?? 0 })
            : t('sin datos')}
        </span>
      </div>
      <CardDescription className="mt-1">
        {t('Porcentaje sobre la nota máxima de cada evaluación (tareas y cuestionarios numéricos).')}
      </CardDescription>
      {count === 0 ? (
        <EmptyHint>{t('Aún no hay calificaciones numéricas en este curso.')}</EmptyHint>
      ) : (
        <div className="mt-6 flex h-44 items-end gap-3">
          {distribution.map((b) => {
            const heightPct = (b.count / max) * 100;
            return (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 flex-col-reverse">
                  <div
                    className="w-full rounded-t-md bg-brand-500"
                    style={{ height: `${heightPct}%`, minHeight: b.count > 0 ? '3px' : '0' }}
                    title={`${b.label}: ${b.count}`}
                  />
                </div>
                <span className="text-sm font-semibold">{b.count}</span>
                <span className="text-[10px] text-slate-500">{b.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ===========================================================================
//  Enrollment funnel (status breakdown)
// ===========================================================================

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendientes',
  ACTIVE: 'Activos',
  COMPLETED: 'Completados',
  REJECTED: 'Rechazados',
  REMOVED: 'Dados de baja',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500',
  ACTIVE: 'bg-emerald-500',
  COMPLETED: 'bg-brand-500',
  REJECTED: 'bg-rose-500',
  REMOVED: 'bg-slate-400',
};

function EnrollmentFunnel({ data }: { data: CourseAnalytics }) {
  const t = getT();
  const entries = Object.entries(data.enrollment.byStatus).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return (
    <Card>
      <CardTitle>{t('Inscripciones por estado')}</CardTitle>
      <CardDescription className="mt-1">
        {t('{n} solicitud(es) en total.', { n: total })}
      </CardDescription>
      {total === 0 ? (
        <EmptyHint>{t('Nadie ha solicitado inscripción todavía.')}</EmptyHint>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map(([status, count]) => (
            <li key={status}>
              <div className="flex items-center justify-between text-sm">
                <span>{t(STATUS_LABELS[status] ?? status)}</span>
                <span className="font-semibold">{count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={'h-full rounded-full ' + (STATUS_COLORS[status] ?? 'bg-slate-400')}
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ===========================================================================
//  Per-evaluation table (submission/attempt rate + scores)
// ===========================================================================

function EvaluationsTable({ data }: { data: CourseAnalytics }) {
  const t = getT();
  return (
    <Card>
      <CardTitle>{t('Rendimiento por evaluación')}</CardTitle>
      <CardDescription className="mt-1">
        {t(
          'Tareas y cuestionarios publicados, en orden de currículum. La tasa es sobre {n} alumno(s) activo(s).',
          { n: data.activeStudents },
        )}
      </CardDescription>
      {data.evaluations.length === 0 ? (
        <EmptyHint>{t('No hay tareas ni cuestionarios publicados aún.')}</EmptyHint>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                <th className="py-2 pr-3 font-medium">{t('Evaluación')}</th>
                <th className="px-2 py-2 font-medium">{t('Entregas')}</th>
                <th className="px-2 py-2 font-medium">{t('A tiempo / tarde')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('Nota media')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.evaluations.map((e) => (
                <tr key={`${e.kind}-${e.id}`}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={e.kind === 'QUIZ' ? 'brand' : 'default'}>
                        {e.kind === 'QUIZ' ? t('Quiz') : t('Tarea')}
                      </Badge>
                      <span className="truncate">{e.title}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${e.ratePct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">
                        {e.done} ({e.ratePct}%)
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-500">
                    {e.kind === 'QUIZ' ? (
                      <span>—</span>
                    ) : (
                      <span>
                        <span className="text-emerald-600">{e.onTime}</span> /{' '}
                        <span className="text-amber-600">{e.late}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-medium">
                    {e.avgScorePct == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      `${e.avgScorePct}%`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ===========================================================================
//  Per-lesson completion (drop-off view)
// ===========================================================================

function LessonCompletion({ data }: { data: CourseAnalytics }) {
  const t = getT();
  return (
    <Card>
      <CardTitle>{t('Progreso por lección')}</CardTitle>
      <CardDescription className="mt-1">
        {t(
          'Porcentaje de los {n} alumno(s) activo(s) que han completado cada lección, en orden de currículum. Útil para ver dónde se atascan o abandonan.',
          { n: data.activeStudents },
        )}
      </CardDescription>
      {data.lessonProgress.length === 0 ? (
        <EmptyHint>{t('No hay lecciones publicadas todavía.')}</EmptyHint>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.lessonProgress.map((l, i) => (
            <li key={l.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="mr-2 font-mono text-xs text-slate-400">{i + 1}</span>
                  {l.title}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {l.completed}/{data.activeStudents} ({l.completionPct}%)
                  {l.viewed > l.completed && (
                    <span className="ml-1 text-slate-400">
                      · {t('{v} vista(s)', { v: l.viewed })}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${l.completionPct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ===========================================================================
//  Weekly enrollment sparkline
// ===========================================================================

function EnrollmentWeekly({ data }: { data: CourseAnalytics }) {
  const t = getT();
  const max = Math.max(1, ...data.enrollment.weekly.map((w) => w.count));
  const total = data.enrollment.weekly.reduce((a, w) => a + w.count, 0);
  return (
    <Card>
      <CardTitle>{t('Solicitudes por semana')}</CardTitle>
      <CardDescription className="mt-1">
        {t('Últimas 12 semanas · {n} en total.', { n: total })}
      </CardDescription>
      <div className="mt-6 flex h-28 items-end gap-1">
        {data.enrollment.weekly.map((w) => (
          <div key={w.week} className="flex flex-1 flex-col-reverse" title={`${w.week}: ${w.count}`}>
            <div
              className="w-full rounded-t-sm bg-emerald-500"
              style={{ height: `${(w.count / max) * 100}%`, minHeight: w.count > 0 ? '2px' : '0' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{data.enrollment.weekly[0]?.week}</span>
        <span>{data.enrollment.weekly[data.enrollment.weekly.length - 1]?.week}</span>
      </div>
    </Card>
  );
}

// ===========================================================================
//  Live session attendance
// ===========================================================================

function LiveAttendance({ data }: { data: CourseAnalytics }) {
  const t = getT();
  return (
    <Card>
      <CardTitle>{t('Asistencia a clases en vivo')}</CardTitle>
      <CardDescription className="mt-1">
        {t('Asistentes únicos por sesión sobre {n} alumno(s) activo(s).', {
          n: data.activeStudents,
        })}
      </CardDescription>
      {data.liveSessions.length === 0 ? (
        <EmptyHint>{t('No hay clases en vivo programadas en este curso.')}</EmptyHint>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.liveSessions.map((s) => (
            <li key={s.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="text-xs text-slate-500">
                  {new Date(s.scheduledStart).toLocaleDateString('es', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </span>
                <span className="w-14 text-right font-semibold">
                  {s.attendees} ({s.attendancePct}%)
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${s.attendancePct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ===========================================================================
//  Daily activity stacked bars (last 30 days)
// ===========================================================================

function ActivityChart({ data }: { data: CourseAnalytics }) {
  const max = Math.max(
    1,
    ...data.activity.map((d) => d.submissions + d.quizAttempts + d.forumPosts),
  );
  const total = data.activity.reduce(
    (a, d) => a + d.submissions + d.quizAttempts + d.forumPosts,
    0,
  );
  const t = getT();
  return (
    <Card>
      <CardTitle>{t('Actividad (últimos 30 días)')}</CardTitle>
      <CardDescription className="mt-1">
        {t('Entregas + intentos de cuestionario + mensajes del foro · {n} eventos.', { n: total })}
      </CardDescription>
      <div className="mt-6 flex h-28 items-end gap-1">
        {data.activity.map((d) => {
          const t = d.submissions + d.quizAttempts + d.forumPosts;
          return (
            <div
              key={d.day}
              className="flex flex-1 flex-col-reverse"
              title={`${d.day}: ${d.submissions} entregas, ${d.quizAttempts} quizzes, ${d.forumPosts} foro`}
            >
              <div
                className="w-full rounded-t-sm bg-brand-500"
                style={{ height: `${(t / max) * 100}%`, minHeight: t > 0 ? '2px' : '0' }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{data.activity[0]?.day}</span>
        <span>{data.activity[data.activity.length - 1]?.day}</span>
      </div>
    </Card>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 text-center text-sm text-slate-500">{children}</p>;
}
