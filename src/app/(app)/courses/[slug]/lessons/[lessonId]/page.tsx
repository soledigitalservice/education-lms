import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { LessonsService } from '@/lib/lessons/service';
import { MaterialsService } from '@/lib/materials/service';
import { Roles } from '@/lib/rbac/roles';
import { ApiError } from '@/lib/api/errors';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { MaterialList } from '@/components/material-list';
import { AddMaterialForm } from '@/components/add-material-form';
import { LessonContentEditor } from './lesson-content-editor';
import { AssignmentPanelTeacher } from './assignment-panel-teacher';
import { AssignmentPanelStudent } from './assignment-panel-student';
import { QuizPanelTeacher } from './quiz-panel-teacher';
import { QuizPanelStudent } from './quiz-panel-student';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string; lessonId: string };
}

export default async function LessonDetailPage({ params }: PageProps) {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };

  const lessons = new LessonsService(prisma);
  let lesson;
  try {
    lesson = await lessons.getById(params.lessonId, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.slug, ctx);
  if (course.id !== lesson.courseId) notFound();

  const materials = new MaterialsService(prisma);
  const materialItems = await materials.listForLesson(lesson.id, ctx);

  const canManage = user.role === Roles.ADMIN || course.teacher.id === user.id;

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <Link
          href={`/courses/${course.slug}`}
          className="text-xs text-slate-500 hover:underline"
        >
          ← {course.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="default">{lesson.type}</Badge>
          {!lesson.publishedAt && canManage && <Badge variant="warning">Borrador</Badge>}
          {lesson.durationMin && (
            <span className="text-xs text-slate-500">{lesson.durationMin} min</span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{lesson.title}</h1>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {canManage ? (
            <Card>
              <CardTitle>Contenido</CardTitle>
              <LessonContentEditor
                lessonId={lesson.id}
                initialContent={lesson.content ?? ''}
              />
            </Card>
          ) : lesson.content ? (
            <Card>
              <CardTitle>Contenido</CardTitle>
              <div className="prose prose-slate mt-4 max-w-none whitespace-pre-wrap text-sm dark:prose-invert">
                {lesson.content}
              </div>
            </Card>
          ) : null}

          {lesson.type === 'ASSIGNMENT' &&
            (canManage ? (
              <AssignmentPanelTeacher lessonId={lesson.id} courseSlug={course.slug} />
            ) : (
              <AssignmentPanelStudent lessonId={lesson.id} courseSlug={course.slug} />
            ))}

          {lesson.type === 'QUIZ' &&
            (canManage ? (
              <QuizPanelTeacher lessonId={lesson.id} courseSlug={course.slug} />
            ) : (
              <QuizPanelStudent lessonId={lesson.id} />
            ))}

          {!canManage && lesson.type === 'LIVE_CLASS' && (
            <Card>
              <CardTitle>Clase en vivo</CardTitle>
              <p className="mt-2 text-sm text-slate-500">
                Cuando el profesor programe una sesión asociada a esta lección, aparecerá aquí el
                acceso para entrar a la sala. Mientras tanto, consulta el{' '}
                <Link href="/calendar" className="text-brand-600 hover:underline">
                  calendario
                </Link>{' '}
                para ver las próximas clases del curso.
              </p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardTitle>Materiales ({materialItems.length})</CardTitle>
            <div className="mt-4">
              <MaterialList items={materialItems} canManage={canManage} showPreviews />
            </div>
          </Card>

          {canManage && (
            <Card>
              <CardTitle>Añadir material</CardTitle>
              <div className="mt-4">
                <AddMaterialForm target={{ kind: 'lesson', lessonId: lesson.id }} />
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
