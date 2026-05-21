'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api/client';
import type { LessonProgressDto } from '@/lib/lesson-progress/service';

interface Props {
  lessonId: string;
  initialCompleted: boolean;
}

/**
 * Student-only progress widget. Records a view once on mount (so analytics can
 * tell who opened the lesson) and offers a complete/undo toggle.
 */
export function LessonProgressTracker({ lessonId, initialCompleted }: Props) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [busy, setBusy] = useState(false);
  const viewed = useRef(false);

  // Fire-and-forget view ping, once per mount. Failures are non-blocking.
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    void apiFetch<LessonProgressDto>(`/api/lessons/${lessonId}/view`, {
      method: 'POST',
    }).catch(() => {});
  }, [lessonId]);

  async function toggle(): Promise<void> {
    const next = !completed;
    setBusy(true);
    try {
      await apiFetch<LessonProgressDto>(`/api/lessons/${lessonId}/complete`, {
        method: 'PUT',
        body: { completed: next },
      });
      setCompleted(next);
    } catch {
      // Leave state unchanged; the button stays actionable for a retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={
        completed
          ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
          : ''
      }
    >
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <CardTitle>
            {completed ? '✓ Lección completada' : 'Tu progreso'}
          </CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            {completed
              ? 'Marcaste esta lección como completada. ¡Buen trabajo!'
              : 'Marca la lección cuando termines para llevar el control de tu avance.'}
          </p>
        </div>
        <Button
          variant={completed ? 'secondary' : 'primary'}
          onClick={toggle}
          loading={busy}
          className="shrink-0"
        >
          {completed ? 'Desmarcar' : 'Marcar como completada'}
        </Button>
      </div>
    </Card>
  );
}
