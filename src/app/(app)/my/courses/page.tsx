import Link from 'next/link';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { EnrollmentsService } from '@/lib/enrollments/service';
import { Roles } from '@/lib/rbac/roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function MyCoursesPage() {
  const user = await requireSession();

  if (user.role === Roles.TEACHER || user.role === Roles.ADMIN) {
    const taught = await new CoursesService(prisma).listTaughtBy(user.id);
    return (
      <>
        <header className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-bold">Mis cursos</h1>
            <p className="mt-1 text-sm text-slate-500">
              {taught.length} curso(s) que estás impartiendo (incluyendo borradores y archivados).
            </p>
          </div>
          <Link href="/courses/new">
            <Button>+ Nuevo curso</Button>
          </Link>
        </header>
        {taught.length === 0 ? (
          <Card className="mt-8">
            <CardTitle>Aún no tienes cursos</CardTitle>
            <CardDescription className="mt-2">
              Crea tu primer curso para empezar.
            </CardDescription>
            <Link
              href="/courses/new"
              className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Crear curso
            </Link>
          </Card>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {taught.map((c) => (
              <li key={c.id}>
                <Link href={`/courses/${c.slug}`} className="block h-full">
                  <Card className="h-full transition hover:border-brand-400 hover:shadow-md">
                    <div className="flex items-center gap-2">
                      {!c.publishedAt && <Badge variant="warning">Borrador</Badge>}
                      {c.archivedAt && <Badge variant="default">Archivado</Badge>}
                      {c.publishedAt && !c.archivedAt && <Badge variant="success">Publicado</Badge>}
                    </div>
                    <CardTitle className="mt-2">{c.title}</CardTitle>
                    <p className="mt-3 text-xs text-slate-500">{c.studentCount} alumno(s) activos</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  // Student / parent: show enrollments.
  const enrollments = await new EnrollmentsService(prisma).listForStudent(user.id);
  const active = enrollments.filter((e) => e.status === 'ACTIVE');
  const pending = enrollments.filter((e) => e.status === 'PENDING');
  const other = enrollments.filter((e) => !['ACTIVE', 'PENDING'].includes(e.status));

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Mis cursos</h1>
        <p className="mt-1 text-sm text-slate-500">
          {active.length} activo(s) · {pending.length} pendiente(s) · {other.length} histórico
        </p>
      </header>

      {enrollments.length === 0 ? (
        <Card className="mt-8">
          <CardTitle>Aún no estás inscrito en ningún curso</CardTitle>
          <CardDescription className="mt-2">
            Explora el catálogo y solicita acceso al curso que te interese.
          </CardDescription>
          <Link
            href="/courses"
            className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ver catálogo
          </Link>
        </Card>
      ) : (
        <div className="mt-8 space-y-6">
          {pending.length > 0 && (
            <Section title="Solicitudes pendientes" badge="warning">
              <EnrollmentGrid items={pending} />
            </Section>
          )}
          {active.length > 0 && (
            <Section title="Cursos activos" badge="success">
              <EnrollmentGrid items={active} />
            </Section>
          )}
          {other.length > 0 && (
            <Section title="Histórico" badge="default">
              <EnrollmentGrid items={other} />
            </Section>
          )}
        </div>
      )}
    </>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge: 'warning' | 'success' | 'default';
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant={badge}>{title}</Badge>
      </div>
      {children}
    </section>
  );
}

function EnrollmentGrid({
  items,
}: {
  items: Array<{
    id: string;
    status: string;
    course?: { title: string; slug: string; teacher: { fullName: string } } | undefined;
  }>;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((e) =>
        e.course ? (
          <li key={e.id}>
            <Link href={`/courses/${e.course.slug}`} className="block h-full">
              <Card className="h-full transition hover:border-brand-400 hover:shadow-md">
                <CardTitle>{e.course.title}</CardTitle>
                <p className="mt-2 text-xs text-slate-500">Prof. {e.course.teacher.fullName}</p>
                <Badge
                  variant={
                    e.status === 'ACTIVE'
                      ? 'success'
                      : e.status === 'PENDING'
                        ? 'warning'
                        : 'default'
                  }
                  className="mt-3"
                >
                  {e.status}
                </Badge>
              </Card>
            </Link>
          </li>
        ) : null,
      )}
    </ul>
  );
}
