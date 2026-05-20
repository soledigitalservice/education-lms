import { notFound, redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { CategoriesService } from '@/lib/categories/service';
import { Roles } from '@/lib/rbac/roles';
import { ApiError } from '@/lib/api/errors';
import { CourseForm } from '../../course-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function EditCoursePage({ params }: PageProps) {
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

  // Only owner or admin can edit.
  if (user.role !== Roles.ADMIN && course.teacher.id !== user.id) {
    redirect(`/courses/${course.slug}`);
  }

  const categories = await new CategoriesService(prisma).listFlat();

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Editar curso</h1>
        <p className="mt-1 text-sm text-slate-500">{course.title}</p>
      </header>
      <div className="mt-8 max-w-2xl">
        <CourseForm mode="edit" categories={categories} initial={course} />
      </div>
    </>
  );
}
