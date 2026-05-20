'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { apiFetch, HttpError } from '@/lib/api/client';

interface Props {
  lessonId: string;
  initialContent: string;
}

export function LessonContentEditor({ lessonId, initialContent }: Props) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/lessons/${lessonId}`, {
        method: 'PATCH',
        body: { content: content || null },
      });
      setSavedAt(new Date());
      router.refresh();
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
    <div className="mt-4 flex flex-col gap-3">
      <textarea
        className="min-h-64 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
        value={content}
        maxLength={50_000}
        placeholder="# Contenido de la lección…&#10;&#10;Soporta markdown plano."
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {savedAt
            ? `Guardado a las ${savedAt.toLocaleTimeString('es')}`
            : 'Cambios sin guardar'}
        </p>
        <Button onClick={save} loading={busy} size="sm">
          Guardar contenido
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
