import Link from 'next/link';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { CategoriesService } from '@/lib/categories/service';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Roles } from '@/lib/rbac/roles';
import { listCoursesQuerySchema } from '@/lib/courses/schemas';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { q?: string; categoryId?: string; page?: string };
}

export default async function CoursesPage({ searchParams }: PageProps) {
  const user = await requireSession();

  const q = listCoursesQuerySchema.parse({
    q: searchParams.q,
    categoryId: searchParams.categoryId,
    page: searchParams.page,
  });

  const courses = new CoursesService(prisma);
  const categories = new CategoriesService(prisma);

  const [page, cats] = await Promise.all([
    courses.list(q, { userId: user.id, role: user.role }),
    categories.listFlat(),
  ]);

  return (
    <>
      <header className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de cursos</h1>
          <p className="mt-1 text-sm text-slate-500">
            {page.total} curso(s) publicado(s).
          </p>
        </div>
        {(user.role === Roles.TEACHER || user.role === Roles.ADMIN) && (
          <Link href="/courses/new">
            <Button>+ Nuevo curso</Button>
          </Link>
        )}
      </header>

      <form
        method="get"
        action="/courses"
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_240px_auto]"
      >
        <input
          type="search"
          name="q"
          defaultValue={q.q ?? ''}
          placeholder="Buscar por título o resumen..."
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
        />
        <select
          name="categoryId"
          defaultValue={q.categoryId ?? ''}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">Todas las categorías</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {page.items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-500">
          No hay cursos que coincidan con tu búsqueda.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((c) => (
            <li key={c.id}>
              <Link href={`/courses/${c.slug}`} className="block h-full">
                <Card className="h-full transition hover:border-brand-400 hover:shadow-md">
                  {c.category && (
                    <Badge variant="brand" className="mb-2">
                      {c.category.name}
                    </Badge>
                  )}
                  <CardTitle>{c.title}</CardTitle>
                  {c.summary && (
                    <CardDescription className="mt-2 line-clamp-3">
                      {c.summary}
                    </CardDescription>
                  )}
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>Prof. {c.teacher.fullName}</span>
                    <span>{c.studentCount} alumno(s)</span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination total={page.total} page={page.page} pageSize={page.pageSize} q={q} />
    </>
  );
}

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  q: { q?: string; categoryId?: string };
}

function Pagination({ total, page, pageSize, q }: PaginationProps) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last === 1) return null;
  const params = new URLSearchParams();
  if (q.q) params.set('q', q.q);
  if (q.categoryId) params.set('categoryId', q.categoryId);
  const hrefFor = (p: number): string => {
    const c = new URLSearchParams(params);
    c.set('page', String(p));
    return `/courses?${c.toString()}`;
  };
  return (
    <nav className="mt-8 flex items-center justify-center gap-2 text-sm">
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        className={
          'rounded-md border border-slate-300 px-3 py-1.5 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 ' +
          (page === 1 ? 'pointer-events-none opacity-50' : '')
        }
      >
        ← Anterior
      </Link>
      <span className="px-2 text-slate-500">
        Página {page} de {last}
      </span>
      <Link
        href={hrefFor(Math.min(last, page + 1))}
        className={
          'rounded-md border border-slate-300 px-3 py-1.5 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 ' +
          (page === last ? 'pointer-events-none opacity-50' : '')
        }
      >
        Siguiente →
      </Link>
    </nav>
  );
}
