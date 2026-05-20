'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch, HttpError } from '@/lib/api/client';

interface LessonItem {
  id: string;
  title: string;
  type: 'CONTENT' | 'LIVE_CLASS' | 'ASSIGNMENT' | 'QUIZ';
  position: number;
  publishedAt: string | null;
  materialCount: number;
}

interface ModuleItem {
  id: string;
  title: string;
  description: string | null;
  position: number;
  publishedAt: string | null;
  lessons: LessonItem[];
}

interface Props {
  courseSlug: string;
  modules: ModuleItem[];
}

export function CurriculumEditor({ courseSlug, modules }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function call(method: string, path: string, body?: unknown): Promise<void> {
    setError(null);
    setBusy(path);
    try {
      await apiFetch(path, { method, body });
      router.refresh();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError('Error inesperado');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      {modules.map((m, idx) => (
        <Card key={m.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Módulo {m.position}
                </span>
                {!m.publishedAt && <Badge variant="warning">Borrador</Badge>}
              </div>
              <h3 className="mt-1 text-lg font-semibold">{m.title}</h3>
              {m.description && (
                <p className="mt-1 text-sm text-slate-500">{m.description}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={idx === 0}
                loading={busy === `/api/modules/${m.id}/reorder-up`}
                onClick={() =>
                  call('POST', `/api/modules/${m.id}/reorder`, { direction: 'up' })
                }
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={idx === modules.length - 1}
                loading={busy === `/api/modules/${m.id}/reorder-down`}
                onClick={() =>
                  call('POST', `/api/modules/${m.id}/reorder`, { direction: 'down' })
                }
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === `/api/modules/${m.id}/publish`}
                onClick={() =>
                  call('PATCH', `/api/modules/${m.id}`, {
                    publishedAt: m.publishedAt ? null : new Date().toISOString(),
                  })
                }
              >
                {m.publishedAt ? 'Despublicar' : 'Publicar'}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (confirm(`¿Eliminar el módulo "${m.title}" y todas sus lecciones?`)) {
                    void call('DELETE', `/api/modules/${m.id}`);
                  }
                }}
              >
                Eliminar
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {m.lessons.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aún no hay lecciones en este módulo.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {m.lessons.map((l, lIdx) => (
                  <li key={l.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="text-xs font-mono text-slate-400">{l.position}</span>
                      <div className="min-w-0">
                        <Link
                          href={`/courses/${courseSlug}/lessons/${l.id}`}
                          className="block truncate text-sm font-medium hover:text-brand-600"
                        >
                          {l.title}
                        </Link>
                        <p className="flex items-center gap-2 text-xs text-slate-500">
                          <Badge variant="default">{l.type}</Badge>
                          <span>{l.materialCount} material(es)</span>
                          {!l.publishedAt && <Badge variant="warning">Borrador</Badge>}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={lIdx === 0}
                        onClick={() =>
                          call('POST', `/api/lessons/${l.id}/reorder`, { direction: 'up' })
                        }
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={lIdx === m.lessons.length - 1}
                        onClick={() =>
                          call('POST', `/api/lessons/${l.id}/reorder`, { direction: 'down' })
                        }
                      >
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          call('PATCH', `/api/lessons/${l.id}`, {
                            publishedAt: l.publishedAt ? null : new Date().toISOString(),
                          })
                        }
                      >
                        {l.publishedAt ? 'Despublicar' : 'Publicar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          if (confirm(`¿Eliminar la lección "${l.title}"?`)) {
                            void call('DELETE', `/api/lessons/${l.id}`);
                          }
                        }}
                      >
                        Borrar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <NewLessonInline moduleId={m.id} onCreated={() => router.refresh()} />
          </div>
        </Card>
      ))}

      <NewModuleInline courseSlug={courseSlug} onCreated={() => router.refresh()} />
    </div>
  );
}

function NewModuleInline({
  courseSlug,
  onCreated,
}: {
  courseSlug: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/courses/${courseSlug}/modules`, {
        method: 'POST',
        body: { title: title.trim() },
      });
      setTitle('');
      onCreated();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError('Error');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-dashed">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          label="Nuevo módulo"
          placeholder="Título del módulo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={2}
          maxLength={160}
          className="flex-1"
        />
        <Button type="submit" loading={busy}>
          Añadir módulo
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}

function NewLessonInline({
  moduleId,
  onCreated,
}: {
  moduleId: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'CONTENT' | 'LIVE_CLASS' | 'ASSIGNMENT' | 'QUIZ'>('CONTENT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/modules/${moduleId}/lessons`, {
        method: 'POST',
        body: { title: title.trim(), type },
      });
      setTitle('');
      onCreated();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError('Error');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700 sm:flex-row sm:items-end"
    >
      <Input
        placeholder="Título de la lección"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        minLength={2}
        maxLength={160}
        className="flex-1"
      />
      <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        <option value="CONTENT">Contenido</option>
        <option value="LIVE_CLASS">Clase en vivo</option>
        <option value="ASSIGNMENT">Tarea</option>
        <option value="QUIZ">Cuestionario</option>
      </Select>
      <Button type="submit" loading={busy} size="sm">
        + Lección
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
