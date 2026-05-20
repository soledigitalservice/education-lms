'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, HttpError } from '@/lib/api/client';
import type { ForumThreadDto } from '@/lib/forums/service';

interface Props {
  courseSlug: string;
  courseTitle: string;
  threads: ForumThreadDto[];
}

export function ForumView({ courseSlug, courseTitle, threads: initial }: Props) {
  const [threads, setThreads] = useState<ForumThreadDto[]>(initial);
  const [showNew, setShowNew] = useState(false);

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={`/courses/${courseSlug}`}
            className="text-xs text-slate-500 hover:underline"
          >
            ← {courseTitle}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Foro</h1>
          <p className="mt-1 text-sm text-slate-500">{threads.length} discusión(es)</p>
        </div>
        <Button onClick={() => setShowNew(true)}>+ Nuevo tema</Button>
      </header>

      {threads.length === 0 ? (
        <Card className="mt-8">
          <CardTitle>El foro está vacío</CardTitle>
          <p className="mt-2 text-sm text-slate-500">
            Sé la primera persona en abrir una discusión. Pregunta, comparte recursos o propón un debate.
          </p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-2">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/courses/${courseSlug}/forum/${t.id}`}>
                <Card className="transition hover:border-brand-400">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {t.pinned && <Badge variant="warning">Fijado</Badge>}
                        {t.locked && <Badge variant="default">Cerrado</Badge>}
                        <h3 className="truncate font-medium">{t.title}</h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Por {t.author.fullName} ·{' '}
                        {new Date(t.lastActivityAt).toLocaleString('es', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                        {t.postCount}
                      </p>
                      <p>posts</p>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showNew && (
        <NewThreadDialog
          courseSlug={courseSlug}
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            const res = await apiFetch<{ threads: ForumThreadDto[] }>(
              `/api/courses/${courseSlug}/forum`,
            );
            setThreads(res.threads);
          }}
        />
      )}
    </>
  );
}

function NewThreadDialog({
  courseSlug,
  onClose,
  onCreated,
}: {
  courseSlug: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>(
        `/api/courses/${courseSlug}/forum/threads`,
        {
          method: 'POST',
          body: { title: title.trim(), body: body.trim() },
        },
      );
      await onCreated();
      router.push(`/courses/${courseSlug}/forum/${created.id}`);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <h2 className="text-lg font-bold">Nuevo tema</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="Título"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Mensaje inicial</label>
            <textarea
              className="min-h-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              required
              maxLength={20_000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Crear tema
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
