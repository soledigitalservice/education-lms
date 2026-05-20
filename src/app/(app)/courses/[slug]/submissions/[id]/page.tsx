import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { SubmissionsService } from '@/lib/submissions/service';
import { ApiError } from '@/lib/api/errors';
import { Roles } from '@/lib/rbac/roles';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { MaterialList } from '@/components/material-list';
import { SubmissionGraderForm } from './grader-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string; id: string };
}

export default async function SubmissionDetailPage({ params }: PageProps) {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };

  const svc = new SubmissionsService(prisma);
  let submission;
  try {
    submission = await svc.getById(params.id, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Only teachers/admins (the service allowed the student too, but the
  // grading UI is teacher-facing — students see their grade inline on the lesson page).
  const assignment = await prisma.assignment.findUnique({
    where: { id: submission.assignmentId },
    select: {
      title: true,
      maxScore: true,
      dueAt: true,
      latePenaltyPct: true,
      course: { select: { teacherId: true, slug: true } },
    },
  });
  if (!assignment) notFound();
  if (user.role !== Roles.ADMIN && assignment.course.teacherId !== user.id) {
    redirect(`/courses/${params.slug}`);
  }

  // Reuse MaterialList-style display for the submission files. We adapt to its API.
  const materialLike = submission.files.map((f) => ({
    id: f.id,
    title: f.originalName,
    type: 'FILE' as const,
    url: '', // not used — download goes through /api/materials, so we provide a custom link below
    fileId: f.fileId,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
  }));

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <Link
          href={`/courses/${params.slug}/assignments/${submission.assignmentId}/submissions`}
          className="text-xs text-slate-500 hover:underline"
        >
          ← Todas las entregas
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {submission.student.fullName} · {assignment.title}
        </h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
          <Badge variant={submission.status === 'GRADED' ? 'success' : 'brand'}>
            {submission.status}
          </Badge>
          {submission.isLate && <Badge variant="warning">Tardía</Badge>}
          {submission.submittedAt &&
            `Entregada ${new Date(submission.submittedAt).toLocaleString('es')}`}
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardTitle>Archivos entregados</CardTitle>
            <div className="mt-4">
              {/* MaterialList uses /api/materials/:id/download — for submissions
                  we re-use the same FileItem shape with a custom downloader. */}
              <SubmissionFiles files={submission.files} />
            </div>
          </Card>

          {submission.notes && (
            <Card>
              <CardTitle>Notas del estudiante</CardTitle>
              <p className="mt-3 whitespace-pre-wrap text-sm">{submission.notes}</p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardTitle>Calificación</CardTitle>
            <p className="mt-2 text-xs text-slate-500">
              Máx. {assignment.maxScore} pts
              {submission.isLate &&
                assignment.latePenaltyPct > 0 &&
                ` · Penalización tardía sugerida: -${assignment.latePenaltyPct}%`}
            </p>
            <SubmissionGraderForm
              submissionId={submission.id}
              maxScore={assignment.maxScore}
              existingGrade={submission.grade}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}

function SubmissionFiles({
  files,
}: {
  files: Array<{ id: string; fileId: string; originalName: string; sizeBytes: number; mimeType: string }>;
}) {
  if (files.length === 0) return <p className="text-sm text-slate-500">Sin archivos.</p>;
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {files.map((f) => (
        <li
          key={f.id}
          className="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <span className="truncate">📎 {f.originalName}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{Math.round(f.sizeBytes / 1024)} KB</span>
            <a
              href={`/api/uploads/${f.fileId}/url`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Descargar
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
