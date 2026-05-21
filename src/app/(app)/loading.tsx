/**
 * Route-transition skeleton for the authenticated app. Shown while a page's
 * server data is loading, so navigation feels instant instead of frozen.
 */
export default function AppLoading() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="flex items-center justify-between border-b border-slate-200 pb-6 dark:border-slate-800">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-64 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          />
        ))}
      </div>
    </div>
  );
}
