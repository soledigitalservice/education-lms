import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getT } from '@/lib/i18n/server';
import { LanguageToggle } from '@/components/language-toggle';

export default async function HomePage() {
  // If the user is already logged in, send them straight to the dashboard.
  const session = await getSession();
  if (session) redirect('/dashboard');
  const t = getT();

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-white dark:bg-slate-950">
      {/* Soft decorative glow — keeps it minimal but not flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl dark:bg-brand-900/30"
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-base font-semibold tracking-tight text-brand-700 dark:text-brand-300">
          Education LMS
        </span>
        <nav className="flex items-center gap-2">
          <LanguageToggle className="mr-1" />
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('Iniciar sesión')}
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            {t('Crear cuenta')}
          </Link>
        </nav>
      </header>

      {/* Hero — fills the rest of the viewport, centered. */}
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-6xl">
          {t('Enseña, aprende y conecta')}{' '}
          <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
            {t('sin fricción')}
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600 dark:text-slate-300">
          {t(
            'La plataforma educativa todo-en-uno: cursos, clases en vivo, tareas y familias, en un solo lugar.',
          )}
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-7 py-3 text-base font-medium text-white shadow-md transition hover:bg-brand-700 sm:w-auto"
          >
            {t('Crear cuenta')}
          </Link>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-7 py-3 text-base font-medium text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 sm:w-auto"
          >
            {t('Iniciar sesión')}
          </Link>
        </div>
      </section>
    </main>
  );
}
