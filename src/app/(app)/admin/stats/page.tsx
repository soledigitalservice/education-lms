import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { AdminStatsService } from '@/lib/admin-stats/service';
import { Roles } from '@/lib/rbac/roles';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminStatsPage() {
  await requireRole(Roles.ADMIN);
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
        <h1 className="text-2xl font-bold">Estadísticas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Salud global de la plataforma. Datos en tiempo real, no cacheados.
        </p>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Usuarios totales"
          value={overview.users.total}
          subtitle={Object.entries(overview.users.byRole)
            .map(([k, v]) => `${k.toLowerCase()}: ${v}`)
            .join(' · ')}
        />
        <Stat
          label="Profesores pendientes"
          value={overview.users.pendingTeachers}
          subtitle="Esperando aprobación admin"
          highlight={overview.users.pendingTeachers > 0}
        />
        <Stat
          label="Cursos publicados"
          value={overview.courses.published}
          subtitle={`${overview.courses.draft} borradores · ${overview.courses.archived} archivados`}
        />
        <Stat
          label="Inscripciones activas"
          value={overview.enrollments.active}
          subtitle={`${overview.enrollments.pending} pendientes`}
        />
        <Stat
          label="Tareas / submisiones"
          value={overview.assessments.assignments}
          subtitle={`${overview.assessments.submissions} entregas · ${overview.assessments.gradedLast7d} calificadas en 7d`}
        />
        <Stat
          label="Contenido del curso"
          value={overview.content.lessons}
          subtitle={`${overview.content.modules} módulos · ${overview.content.materials} materiales`}
        />
        <Stat
          label="Mensajes (7 días)"
          value={overview.realtime.chatMessagesLast7d}
          subtitle="Actividad del chat"
        />
        <Stat
          label="Clases en vivo (30 días)"
          value={overview.realtime.liveSessionsLast30d}
          subtitle={`${overview.realtime.recordingsReady} grabaciones listas`}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardTitle>Engagement (últimos 30 días)</CardTitle>
            <CardDescription className="mt-1">
              Nuevos usuarios + inscripciones + entregas + mensajes por día.
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
          <CardTitle>Actividad reciente</CardTitle>
          <CardDescription className="mt-1">
            Últimas 30 acciones del audit log.
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
                    {a.actor ? <strong>{a.actor.fullName}</strong> : 'Sistema'} sobre {a.entity}
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
              <li className="text-slate-500">Sin actividad reciente.</li>
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
