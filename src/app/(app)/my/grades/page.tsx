import Link from 'next/link';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { GradesService } from '@/lib/grades/service';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function MyGradesPage() {
  const user = await requireSession();
  const grades = await new GradesService(prisma).listForStudent(user.id, {
    userId: user.id,
    role: user.role,
  });

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Mis calificaciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          {grades.length} calificación(es) recibida(s).
        </p>
      </header>

      {grades.length === 0 ? (
        <Card className="mt-8">
          <CardTitle>Aún no tienes calificaciones</CardTitle>
          <p className="mt-2 text-sm text-slate-500">
            Entrega tareas o completa cuestionarios para empezar a recibir notas.
          </p>
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          {grades.map((g) => (
            <Card key={g.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">
                    <Badge variant="default">{g.source.kind === 'submission' ? 'Tarea' : 'Cuestionario'}</Badge>{' '}
                    · {g.courseTitle}
                  </p>
                  <h3 className="mt-1 font-semibold">
                    {g.source.kind === 'submission' ? g.source.assignmentTitle : g.source.quizTitle}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Calificado por {g.graderName} ·{' '}
                    {new Date(g.gradedAt).toLocaleDateString('es', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">
                    {g.numericValue ?? g.conceptValue ?? g.letterValue}
                  </p>
                  <p className="text-xs text-slate-500">{g.scale}</p>
                </div>
              </div>
              {g.feedback && (
                <div className="mt-4 rounded-md border-l-4 border-brand-500 bg-slate-50 p-3 text-sm dark:bg-slate-800">
                  <p className="whitespace-pre-wrap">{g.feedback}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
