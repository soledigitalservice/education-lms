'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { FileUploader, type UploadedFile } from '@/components/file-uploader';
import { apiFetch, HttpError } from '@/lib/api/client';

interface AssignmentSummary {
  id: string;
  title: string;
  instructions: string | null;
  maxScore: number;
  dueAt: string | null;
  allowLate: boolean;
  latePenaltyPct: number;
  publishedAt: string | null;
  attachments: Array<{ id: string; fileId: string; originalName: string }>;
}

interface Submission {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'LATE' | 'GRADED' | 'RETURNED';
  notes: string | null;
  submittedAt: string | null;
  isLate: boolean;
  files: Array<{ id: string; fileId: string; originalName: string; sizeBytes: number }>;
  grade: null | {
    scale: string;
    numericValue: number | null;
    conceptValue: string | null;
    letterValue: string | null;
    feedback: string | null;
  };
}

interface Props {
  lessonId: string;
  courseSlug: string;
}

export function AssignmentPanelStudent({ lessonId, courseSlug }: Props) {
  const router = useRouter();
  const [assignment, setAssignment] = useState<AssignmentSummary | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await apiFetch<Array<AssignmentSummary & { lessonId: string | null }>>(
          `/api/courses/${courseSlug}/assignments`,
        );
        const mine = list.find((a) => a.lessonId === lessonId);
        if (!mine || !mine.publishedAt) {
          setLoading(false);
          return;
        }
        setAssignment(mine);
        const sub = await apiFetch<Submission>(`/api/assignments/${mine.id}/submissions/mine`);
        setSubmission(sub);
        setNotes(sub.notes ?? '');
      } catch (err) {
        setError(err instanceof HttpError ? String(err.body.message) : 'Error');
      } finally {
        setLoading(false);
      }
    })();
  }, [courseSlug, lessonId]);

  if (loading) return <Card>Cargando…</Card>;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!assignment) {
    return (
      <Card>
        <CardTitle>Sin tarea</CardTitle>
        <p className="mt-2 text-sm text-slate-500">El profesor aún no ha publicado la tarea.</p>
      </Card>
    );
  }

  const isLocked =
    submission &&
    (submission.status === 'SUBMITTED' || submission.status === 'GRADED' || submission.status === 'LATE');

  async function addFile(file: UploadedFile): Promise<void> {
    if (!submission) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Submission>(`/api/submissions/${submission.id}`, {
        method: 'PATCH',
        body: { addFileIds: [file.fileId] },
      });
      setSubmission(updated);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(id: string): Promise<void> {
    if (!submission) return;
    setBusy(true);
    try {
      await apiFetch(`/api/submission-files/${id}`, { method: 'DELETE' });
      setSubmission({ ...submission, files: submission.files.filter((f) => f.id !== id) });
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(): Promise<void> {
    if (!submission) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Submission>(`/api/submissions/${submission.id}`, {
        method: 'PATCH',
        body: { notes },
      });
      setSubmission(updated);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (!submission) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Submission>(`/api/submissions/${submission.id}/submit`, {
        method: 'POST',
        body: { notes },
      });
      setSubmission(updated);
      router.refresh();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  const dueLabel = assignment.dueAt
    ? `Entrega antes del ${new Date(assignment.dueAt).toLocaleString('es')}`
    : 'Sin fecha límite';

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{assignment.title}</CardTitle>
        <Badge
          variant={
            submission?.status === 'GRADED'
              ? 'success'
              : submission?.status === 'SUBMITTED' || submission?.status === 'LATE'
                ? 'brand'
                : submission?.status === 'RETURNED'
                  ? 'warning'
                  : 'default'
          }
        >
          {submission?.status ?? 'NO ENTREGADO'}
        </Badge>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {dueLabel} · Máx. {assignment.maxScore} pts
        {assignment.latePenaltyPct > 0 && ` · Penalización ${assignment.latePenaltyPct}% si tarde`}
      </p>

      {assignment.instructions && (
        <p className="mt-3 whitespace-pre-wrap text-sm">{assignment.instructions}</p>
      )}

      {submission?.grade && (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-700 dark:bg-emerald-950">
          <p className="font-medium">Calificación</p>
          <p className="mt-1">
            {submission.grade.numericValue != null && `${submission.grade.numericValue} / ${assignment.maxScore}`}
            {submission.grade.conceptValue && submission.grade.conceptValue}
            {submission.grade.letterValue && submission.grade.letterValue}
          </p>
          {submission.grade.feedback && (
            <p className="mt-2 text-xs whitespace-pre-wrap">{submission.grade.feedback}</p>
          )}
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold">Tu entrega</h3>
      <div className="mt-2 space-y-2">
        {submission?.files.length === 0 && (
          <p className="text-xs text-slate-500">Aún no has añadido archivos.</p>
        )}
        {submission?.files.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
          >
            <span className="truncate">📎 {f.originalName}</span>
            {!isLocked && (
              <Button size="sm" variant="ghost" onClick={() => removeFile(f.id)} disabled={busy}>
                Quitar
              </Button>
            )}
          </div>
        ))}
      </div>

      {!isLocked && (
        <div className="mt-3">
          <FileUploader kind="file" onUploaded={addFile} label="Adjuntar archivo" disabled={busy} />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-1">
        <label className="text-sm font-medium">Notas (opcional)</label>
        <textarea
          className="min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          value={notes}
          maxLength={10_000}
          disabled={isLocked ?? false}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <Alert variant="error" className="mt-3">{error}</Alert>}

      <div className="mt-4 flex flex-wrap gap-2">
        {!isLocked && (
          <>
            <Button onClick={saveDraft} variant="secondary" loading={busy}>
              Guardar borrador
            </Button>
            <Button onClick={submit} loading={busy}>
              Entregar
            </Button>
          </>
        )}
        {submission?.status === 'RETURNED' && (
          <p className="text-xs text-amber-600">
            El profesor te devolvió la entrega para revisar. Edita y vuelve a entregar.
          </p>
        )}
      </div>
    </Card>
  );
}
