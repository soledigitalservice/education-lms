import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { Roles } from '@/lib/rbac/roles';
import { prisma } from '@/lib/prisma';
import { UsersService } from '@/lib/users/service';
import { getT } from '@/lib/i18n/server';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ApproveRejectActions } from './approve-reject-actions';

// Render fresh on every request — admin moderation is dynamic.
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  await requireRole(Roles.ADMIN);

  const users = new UsersService(prisma);
  const t = getT();
  const [list, pending] = await Promise.all([
    users.list({ page: 1, pageSize: 25 }),
    users.listPendingTeachers(),
  ]);

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">{t('Administración de usuarios')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('Aprobar profesores pendientes, ver y moderar usuarios.')}
        </p>
      </header>

      <section className="mt-8 space-y-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('Profesores pendientes de aprobación')}</CardTitle>
              <CardDescription className="mt-1">
                {pending.length === 0
                  ? t('No hay solicitudes pendientes.')
                  : t('{n} solicitud(es) en espera.', { n: pending.length })}
              </CardDescription>
            </div>
            <Badge variant={pending.length === 0 ? 'success' : 'warning'}>
              {pending.length}
            </Badge>
          </div>

          {pending.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {pending.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{t.fullName}</p>
                    <p className="text-xs text-slate-500">{t.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <ApproveRejectActions teacherId={t.id} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Usuarios recientes')}</CardTitle>
            <Badge>{t('{n} total', { n: list.total })}</Badge>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">{t('Nombre')}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">Email</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">{t('Rol')}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">{t('Estado')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {list.items.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 text-sm">{u.fullName}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{u.email}</td>
                    <td className="px-4 py-2 text-sm">
                      <Badge variant="default">{u.role}</Badge>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <Badge
                        variant={
                          u.status === 'ACTIVE'
                            ? 'success'
                            : u.status === 'PENDING_APPROVAL'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {u.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {t(
              'Mostrando los {n} usuarios más recientes de {total} totales. Para estadísticas globales y actividad reciente, visita',
              { n: list.items.length, total: list.total },
            )}{' '}
            <Link href="/admin/stats" className="text-brand-600 hover:underline">
              {t('el panel de estadísticas')}
            </Link>
            .
          </p>
        </Card>
      </section>
    </>
  );
}

