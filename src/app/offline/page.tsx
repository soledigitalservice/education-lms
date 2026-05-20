/**
 * Fallback page shown by the service worker when the user is offline
 * and navigates to an uncached URL.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
          Sin conexión
        </p>
        <h1 className="mt-2 text-2xl font-bold">No hay conexión a internet</h1>
        <p className="mt-3 text-sm text-slate-500">
          No podemos cargar esta página ahora mismo. Comprueba tu conexión e inténtalo de
          nuevo. Las páginas que ya hayas visitado podrían estar disponibles offline.
        </p>
      </div>
    </main>
  );
}
