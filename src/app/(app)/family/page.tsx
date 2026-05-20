import { redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ParentLinksService } from '@/lib/parent-links/service';
import { Roles } from '@/lib/rbac/roles';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { FamilyParentView } from './family-parent-view';
import { FamilyStudentInbox } from './family-student-inbox';

export const dynamic = 'force-dynamic';

export default async function FamilyPage() {
  const user = await requireSession();
  // Teachers and admins don't have a family page.
  if (user.role === Roles.TEACHER) {
    redirect('/dashboard');
  }

  const links = await new ParentLinksService(prisma).listMine({
    userId: user.id,
    role: user.role,
  });

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Familia</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.role === Roles.PARENT
            ? 'Vincula tu cuenta con la de tus hijos/as para ver sus cursos y notas.'
            : 'Aprueba o rechaza solicitudes de tus padres/tutores.'}
        </p>
      </header>

      {user.role === Roles.PARENT || user.role === Roles.ADMIN ? (
        <FamilyParentView initialLinks={links} currentUserId={user.id} />
      ) : user.role === Roles.STUDENT ? (
        <FamilyStudentInbox initialLinks={links} currentUserId={user.id} />
      ) : (
        <Card className="mt-8">
          <CardTitle>Vista no disponible</CardTitle>
          <CardDescription>
            Esta sección es para padres y estudiantes.
          </CardDescription>
        </Card>
      )}
    </>
  );
}
