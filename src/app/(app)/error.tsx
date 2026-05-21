'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Error boundary for the authenticated app. Catches render/server errors in any
 * page below /(app) and shows a branded fallback instead of a blank crash.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console (and any error reporter wired up later).
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="text-5xl" aria-hidden>
        ⚠️
      </span>
      <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-50">
        Algo salió mal
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
        Ocurrió un error inesperado al cargar esta sección. Puedes reintentar; si persiste, vuelve
        a tu panel.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-slate-400">ref: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset}>Reintentar</Button>
        <a
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Ir a mi panel
        </a>
      </div>
    </div>
  );
}
