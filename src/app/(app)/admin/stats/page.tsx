import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { AdminStatsService } from '@/lib/admin-stats/service';
import { Roles } from '@/lib/rbac/roles';
import { getT } from '@/lib/i18n/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminStatsPage() {
  await requireRole(Roles.ADMIN);
  const t = getT();
  const svc = new AdminStatsService(prisma);
  const [overview, activity, engagement] = await Promise.all([
    svc.overview(),
    svc.activityFeed(30),
    svc.engagement(30),
  ]);

  // Peak engagement day (used to scale the sparkline bars).
  const maxDayTotal = Math.max(
    1,
    ...engagement.map(
      (d) => d.newUsers + d.newEnrollments + d.newSubmissions + d.newMessages,
    ),
  );

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">{t('Estadísticas')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('Salud global de la plataforma. Datos en tiempo real, no cacheados.')}
        </p>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('Usuarios totales')}
          value={overview.users.total}
          subtitle={Object.entries(overview.users.byRole)
            .map(([k, v]) => `${k.toLowerCase()}: ${v}`)
            .join(' · ')}
        />
        <Stat
          label={t('Profesores pendientes')}
          value={overview.users.pendingTeachers}
          subtitle={t('Esperando aprobación admin')}
          highlight={overview.users.pendingTeachers > 0}
        />
        <Stat
          label={t('Cursos publicados')}
          value={overview.courses.published}
          subtitle={t('{d} borradores · {a} archivados', {
            d: overview.courses.draft,
            a: overview.courses.archived,
          })}
        />
        <Stat
          label={t('Inscripciones activas')}
          value={overview.enrollments.active}
          subtitle={t('{n} pendientes', { n: overview.enrollments.pending })}
        />
        <Stat
          label={t('Tareas / submisiones')}
          value={overview.assessments.assignments}
          subtitle={t('{s} entregas · {g} calificadas en 7d', {
            s: overview.assessments.submissions,
            g: overview.assessments.gradedLast7d,
          })}
        />
        <Stat
          label={t('Contenido del curso')}
          value={overview.content.lessons}
          subtitle={t('{m} módulos · {mat} materiales', {
            m: overview.content.modules,
            mat: overview.content.materials,
          })}
        />
        <Stat
          label={t('Mensajes (7 días)')}
          value={overview.realtime.chatMessagesLast7d}
          subtitle={t('Actividad del chat')}
        />
        <Stat
          label={t('Clases en vivo (30 días)')}
          value={overview.realtime.liveSessionsLast30d}
          subtitle={t('{n} grabaciones listas', { n: overview.realtime.recordingsReady })}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardTitle>{t('Engagement (últimos 30 días)')}</CardTitle>
            <CardDescription className="mt-1">
              {t('Nuevos usuarios + inscripciones + entregas + mensajes por día.')}
            </CardDescription>
            <div className="mt-4 flex h-40 items-end gap-1">
              {engagement.map((d) => {
                const total =
                  d.newUsers + d.newEnrollments + d.newSubmissions + d.newMessages;
                const heightPct = (total / maxDayTotal) * 100;
                return (
                  <div
                    key={d.day}
                    className="flex flex-1 flex-col-reverse"
                    title={`${d.day}: ${total} eventos (${d.newUsers}u + ${d.newEnrollments}e + ${d.newSubmissions}s + ${d.newMessages}m)`}
                  >
                    <div
                      className="w-full rounded-t-sm bg-brand-500"
                      style={{ height: `${heightPct}%`, minHeight: total > 0 ? '2px' : '0' }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-slate-500">
              <span>{engagement[0]?.day}</span>
              <span>{engagement[engagement.length - 1]?.day}</span>
            </div>
          </Card>
        </div>

        <Card>
          <CardTitle>{t('Actividad reciente')}</CardTitle>
          <CardDescription className="mt-1">
            {t('Últimas 30 acciones del audit log.')}
          </CardDescription>
          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-xs">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-2 border-b border-slate-200 pb-2 last:border-0 dark:border-slate-800"
              >
                <Badge variant="default">{a.action}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {a.actor ? <strong>{a.actor.fullName}</strong> : t('Sistema')} {t('sobre')}{' '}
                    {a.entity}
                  </p>
                  <p className="text-slate-500">
                    {new Date(a.createdAt).toLocaleString('es', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
              </li>
            ))}
            {activity.length === 0 && (
              <li className="text-slate-500">{t('Sin actividad reciente.')}</li>
            )}
          </ul>
        </Card>
      </section>
    </>
  );
}

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
          (highlight && value > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100')
        }
      >
        {value.toLocaleString('es')}
      </p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </Card>
  );
}
