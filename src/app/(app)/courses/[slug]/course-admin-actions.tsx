'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { apiFetch, HttpError } from '@/lib/api/client';
import type { CourseDto } from '@/lib/courses/service';

export function CourseAdminActions({ course }: { course: CourseDto }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: 'publish' | 'archive' | 'delete'): Promise<void> {
    if (action === 'delete' && !confirm('¿Eliminar este curso? Esta acción es reversible solo por un administrador en la base de datos.')) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      if (action === 'delete') {
        await apiFetch(`/api/courses/${course.id}`, { method: 'DELETE' });
        router.push('/courses');
        router.refresh();
        return;
      }
      await apiFetch(`/api/courses/${course.id}/${action}`, { method: 'POST' });
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
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {!course.publishedAt && (
          <Button size="sm" loading={busy === 'publish'} onClick={() => call('publish')}>
            Publicar
          </Button>
        )}
        {course.publishedAt && !course.archivedAt && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'archive'}
            onClick={() => call('archive')}
          >
            Archivar
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          loading={busy === 'delete'}
          onClick={() => call('delete')}
        >
          Eliminar
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
