import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { ModulesService } from '@/lib/modules/service';
import { LessonsService } from '@/lib/lessons/service';
import { Roles } from '@/lib/rbac/roles';
import { getT } from '@/lib/i18n/server';
import { ApiError } from '@/lib/api/errors';
import { Card } from '@/components/ui/card';
import { CurriculumEditor } from './curriculum-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function CurriculumPage({ params }: PageProps) {
  const user = await requireSession();
  const t = getT();
  const ctx = { userId: user.id, role: user.role };
  const courses = new CoursesService(prisma);

  let course;
  try {
    course = await courses.getByIdOrSlug(params.slug, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  if (user.role !== Roles.ADMIN && course.teacher.id !== user.id) {
    redirect(`/courses/${course.slug}`);
  }

  const modules = new ModulesService(prisma);
  const lessonsSvc = new LessonsService(prisma);
  const moduleRows = await modules.listForCourse(course.id);
  // Load lessons per module in parallel (small fan-out).
  const lessonsByModule = Object.fromEntries(
    await Promise.all(
      moduleRows.map(async (m) => [m.id, await lessonsSvc.listForModule(m.id, ctx)] as const),
    ),
  );

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
          <h1 className="mt-1 text-2xl font-bold">{t('Currículum')} · {course.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t(
              'Organiza módulos y lecciones. Los borradores no son visibles para los alumnos hasta que los publiques.',
            )}
          </p>
        </div>
      </header>

      <div className="mt-8">
        {moduleRows.length === 0 ? (
          <Card>
            <h2 className="text-lg font-semibold">{t('Empieza por un módulo')}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {t('Los módulos agrupan lecciones. Crea el primero abajo.')}
            </p>
          </Card>
        ) : null}
        <CurriculumEditor
          courseSlug={course.slug}
          modules={moduleRows.map((m) => ({
            ...m,
            lessons: lessonsByModule[m.id] ?? [],
          }))}
        />
      </div>
    </>
  );
}
