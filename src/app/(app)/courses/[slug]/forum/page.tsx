import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { ForumsService } from '@/lib/forums/service';
import { ApiError } from '@/lib/api/errors';
import { Card } from '@/components/ui/card';
import { ForumView } from './forum-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function CourseForumPage({ params }: PageProps) {
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

  const forums = new ForumsService(prisma);
  let threads;
  try {
    threads = await forums.listThreads(course.id, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <Card>
          <p className="text-sm text-slate-500">
            El foro está reservado a estudiantes inscritos en este curso. Solicita acceso al curso
            primero.
          </p>
          <Link
            href={`/courses/${course.slug}`}
            className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            ← Volver al curso
          </Link>
        </Card>
      );
    }
    throw err;
  }

  return <ForumView courseSlug={course.slug} courseTitle={course.title} threads={threads} />;
}
