import { redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { Roles } from '@/lib/rbac/roles';
import { prisma } from '@/lib/prisma';
import { CategoriesService } from '@/lib/categories/service';
import { CourseForm } from '../course-form';

export const dynamic = 'force-dynamic';

export default async function NewCoursePage() {
  const user = await requireSession();
  if (user.role !== Roles.TEACHER && user.role !== Roles.ADMIN) {
    redirect('/courses');
  }
  const categories = await new CategoriesService(prisma).listFlat();
  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Nuevo curso</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quedará en borrador hasta que pulses &quot;Publicar&quot;.
        </p>
      </header>
      <div className="mt-8 max-w-2xl">
        <CourseForm mode="create" categories={categories} />
      </div>
    </>
  );
}
