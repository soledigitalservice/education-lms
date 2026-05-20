'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  submissionCount?: number;
}

interface Props {
  lessonId: string;
  courseSlug: string;
}

/**
 * Loads-or-creates an assignment bound to this lesson. The teacher edits
 * basic properties inline and gets a link to the submissions table.
 */
export function AssignmentPanelTeacher({ lessonId, courseSlug }: Props) {
  const router = useRouter();
  const [assignment, setAssignment] = useState<AssignmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Look up via course list — cheaper than guessing the assignment id.
    // The lesson page also embeds the lessonId, so fetching all assignments
    // for the course and filtering client-side is fine for now.
    void (async () => {
      try {
        const list = await apiFetch<AssignmentSummary[] & { lessonId?: string }[]>(
          `/api/courses/${courseSlug}/assignments`,
        );
        // The DTO includes lessonId; filter.
        const mine = (list as unknown as Array<AssignmentSummary & { lessonId: string | null }>)
          .find((a) => a.lessonId === lessonId) ?? null;
        setAssignment(mine);
      } catch (err) {
        setError(err instanceof HttpError ? String(err.body.message) : 'Error');
      } finally {
        setLoading(false);
      }
    })();
  }, [courseSlug, lessonId]);

  async function createNow(): Promise<void> {
    setLoading(true);
    try {
      const created = await apiFetch<AssignmentSummary>(
        `/api/courses/${courseSlug}/assignments`,
        {
          method: 'POST',
          body: { lessonId, title: 'Nueva tarea', maxScore: 100, allowLate: true, latePenaltyPct: 0 },
        },
      );
      setAssignment(created);
      router.refresh();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Card>Cargando tarea…</Card>;
  }
  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }
  if (!assignment) {
    return (
      <Card>
        <CardTitle>Crear tarea</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Aún no hay una tarea vinculada a esta lección. Crea una en blanco y rellénala.
        </p>
        <Button className="mt-4" onClick={createNow}>
          Crear tarea
        </Button>
      </Card>
    );
  }

  return <AssignmentEditor assignment={assignment} courseSlug={courseSlug} />;
}

function AssignmentEditor({
  assignment,
  courseSlug,
}: {
  assignment: AssignmentSummary;
  courseSlug: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: assignment.title,
    instructions: assignment.instructions ?? '',
    maxScore: assignment.maxScore,
    dueAt: assignment.dueAt ? assignment.dueAt.slice(0, 16) : '',
    allowLate: assignment.allowLate,
    latePenaltyPct: assignment.latePenaltyPct,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/assignments/${assignment.id}`, {
        method: 'PATCH',
        body: {
          title: form.title.trim(),
          instructions: form.instructions.trim() || null,
          maxScore: form.maxScore,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          allowLate: form.allowLate,
          latePenaltyPct: form.latePenaltyPct,
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(): Promise<void> {
    setBusy(true);
    try {
      await apiFetch(`/api/assignments/${assignment.id}`, {
        method: 'PATCH',
        body: { publishedAt: assignment.publishedAt ? null : new Date().toISOString() },
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Tarea</CardTitle>
        <div className="flex items-center gap-2">
          {assignment.publishedAt ? (
            <Badge variant="success">Publicada</Badge>
          ) : (
            <Badge variant="warning">Borrador</Badge>
          )}
          <Link href={`/courses/${courseSlug}/assignments/${assignment.id}/submissions`}>
            <Button size="sm" variant="secondary">
              Entregas{' '}
              {assignment.submissionCount !== undefined && (
                <Badge className="ml-2">{assignment.submissionCount}</Badge>
              )}
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Input
          label="Título"
          value={form.title}
          maxLength={200}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Instrucciones
          </label>
          <textarea
            className="min-h-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
            maxLength={20_000}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Puntaje máximo"
            type="number"
            min={1}
            value={form.maxScore}
            onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value) })}
          />
          <Input
            label="Fecha límite"
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
          />
          <Input
            label="Penalización % por entrega tardía"
            type="number"
            min={0}
            max={100}
            value={form.latePenaltyPct}
            onChange={(e) => setForm({ ...form, latePenaltyPct: Number(e.target.value) })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.allowLate}
            onChange={(e) => setForm({ ...form, allowLate: e.target.checked })}
            className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Permitir entregas tardías
        </label>

        {error && <Alert variant="error">{error}</Alert>}
        {saved && !error && <p className="text-xs text-emerald-600">Cambios guardados.</p>}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={busy}>
            Guardar tarea
          </Button>
          <Button variant="secondary" onClick={togglePublish} loading={busy}>
            {assignment.publishedAt ? 'Despublicar' : 'Publicar'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
