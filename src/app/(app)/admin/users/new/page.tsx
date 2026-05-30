import Link from 'next/link';

import { requireRole } from '@/lib/auth/session';
import { Roles } from '@/lib/rbac/roles';
import { getT } from '@/lib/i18n/server';
import { AdminCreateUserForm } from './admin-create-user-form';

export const dynamic = 'force-dynamic';

export default async function AdminNewUserPage() {
  await requireRole(Roles.ADMIN);
  const t = getT();

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <Link
          href="/admin/users"
          className="text-xs text-slate-500 hover:underline"
        >
          ← {t('Administración de usuarios')}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{t('Crear usuario')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('El nuevo usuario quedará activo de inmediato. Comunícale su correo y contraseña por un canal seguro.')}
        </p>
      </header>
      <div className="mt-8 max-w-xl">
        <AdminCreateUserForm />
      </div>
    </>
  );
}
