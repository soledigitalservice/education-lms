import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { QuizAttemptsService } from '@/lib/quiz-attempts/service';
import { Roles } from '@/lib/rbac/roles';
import { ApiError } from '@/lib/api/errors';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string; id: string };
}

export default async function QuizAttemptsPage({ params }: PageProps) {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };

  // Validate ownership through quiz → lesson → module → course.
  const quiz = await prisma.quiz.findUnique({
    where: { id: params.id },
    include: {
      lesson: {
        include: {
          module: { include: { course: { select: { id: true, teacherId: true, slug: true } } } },
        },
      },
    },
  });
  if (!quiz) notFound();
  if (user.role !== Roles.ADMIN && quiz.lesson.module.course.teacherId !== user.id) {
    redirect(`/courses/${params.slug}`);
  }

  let attempts;
  try {
    attempts = await new QuizAttemptsService(prisma).listForQuiz(params.id, ctx);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw err;
  }

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <Link href={`/courses/${params.slug}`} className="text-xs text-slate-500 hover:underline">
          ← Curso
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Intentos · {quiz.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{attempts.length} intento(s)</p>
      </header>

      {attempts.length === 0 ? (
        <Card className="mt-8">
          <p className="text-sm text-slate-500">Aún no hay intentos.</p>
        </Card>
      ) : (
        <Card className="mt-8">
          <CardTitle>Resultados</CardTitle>
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {attempts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{a.studentName}</p>
                  <p className="text-xs text-slate-500">
                    Empezado {new Date(a.startedAt).toLocaleString('es')}
                    {a.submittedAt &&
                      ` · entregado ${new Date(a.submittedAt).toLocaleString('es')}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {a.submittedAt ? (
                    <span className="text-sm font-medium">
                      {a.score?.toFixed(1) ?? '-'} / {a.maxScore?.toFixed(1) ?? '-'}
                    </span>
                  ) : (
                    <Badge variant="warning">En curso</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
