import { requireRole } from '@/lib/auth/session';
import { Roles } from '@/lib/rbac/roles';
import { prisma } from '@/lib/prisma';
import { CategoriesService } from '@/lib/categories/service';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { CategoriesAdmin } from './categories-admin';

export const dynamic = 'force-dynamic';

export default async function AdminCategoriesPage() {
  await requireRole(Roles.ADMIN);
  const list = await new CategoriesService(prisma).listFlat();
  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Categorías</h1>
        <p className="mt-1 text-sm text-slate-500">
          Crea, renombra y reorganiza el árbol de categorías de cursos.
        </p>
      </header>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <CategoriesAdmin initial={list} />
        <Card>
          <CardTitle>Reglas</CardTitle>
          <CardDescription className="mt-2">
            <ul className="list-disc space-y-1 pl-4">
              <li>El slug debe ser único.</li>
              <li>Una categoría no puede ser ancestra de sí misma (no se permiten ciclos).</li>
              <li>No se puede eliminar una categoría que tenga cursos o subcategorías; reasígnalos primero.</li>
            </ul>
          </CardDescription>
        </Card>
      </div>
    </>
  );
}
