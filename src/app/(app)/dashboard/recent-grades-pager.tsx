'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { CardDescription } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';

interface GradeItem {
  id: string;
  numericValue: number | null;
  conceptValue: string | null;
  letterValue: string | null;
  submission: { assignment: { title: string; maxScore: number } } | null;
}

const PAGE_SIZE = 5;

/**
 * Recent grades carousel for the student dashboard. Shows 5 at a time with
 * prev/next arrows; the title above ("Notas") and the "View all" link live in
 * the parent Card so the layout stays consistent with the rest of the panel.
 */
export function RecentGradesPager({ grades }: { grades: GradeItem[] }) {
  const t = useT();
  const [page, setPage] = useState(0);

  if (grades.length === 0) {
    return (
      <CardDescription className="mt-3">
        {t('Aún no tienes notas. Cuando el profesor califique tu primera entrega aparecerá aquí.')}
      </CardDescription>
    );
  }

  const total = Math.max(1, Math.ceil(grades.length / PAGE_SIZE));
  const safePage = Math.min(page, total - 1);
  const slice = grades.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <>
      <ul className="mt-4 space-y-2">
        {slice.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
          >
            <span className="min-w-0 truncate">
              {g.submission?.assignment.title ?? t('Cuestionario')}
            </span>
            <span className="font-medium">
              {g.numericValue != null && g.submission
                ? `${g.numericValue} / ${g.submission.assignment.maxScore}`
                : g.conceptValue ?? g.letterValue ?? '—'}
            </span>
          </li>
        ))}
      </ul>
      {grades.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label={t('Anterior')}
          >
            ←
          </Button>
          <span className="text-xs text-slate-500">
            {safePage + 1} / {total}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={safePage >= total - 1}
            onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
            aria-label={t('Siguiente')}
          >
            →
          </Button>
        </div>
      )}
    </>
  );
}
