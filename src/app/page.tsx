import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export default async function HomePage() {
  // If the user is already logged in, send them straight to the dashboard.
  const session = await getSession();
  if (session) redirect('/dashboard');

  return (
    <main className="min-h-screen">
      {/* ============================================ Sticky header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-brand-700 dark:text-brand-300"
          >
            Education LMS
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
            >
              Crear cuenta
            </Link>
          </nav>
        </div>
      </header>

      {/* ============================================ Hero */}
      <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            Plataforma educativa todo-en-uno
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-6xl">
            Enseña, aprende y conecta{' '}
            <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
              sin fricción
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300 sm:text-xl">
            Cursos, clases en vivo, tareas, calificaciones, chat en tiempo real y vinculación con las
            familias — todo en una sola plataforma moderna, segura y accesible desde cualquier
            dispositivo.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-base font-medium text-white shadow-md transition hover:bg-brand-700 sm:w-auto"
            >
              Crear cuenta gratis →
            </Link>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:w-auto"
            >
              Ya tengo cuenta
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Sin tarjeta. Listo en menos de un minuto.
          </p>
        </div>
      </section>

      {/* ============================================ Features grid */}
      <section className="border-t border-slate-200 bg-slate-50 px-4 py-16 dark:border-slate-800 dark:bg-slate-900/50 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Todo lo que necesitas para enseñar
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
              Diseñada desde cero para colegios, academias y profesores independientes. Mobile-first,
              instalable como app, y construida con tecnologías modernas.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon="📚"
              title="Cursos y currículum"
              body="Organiza el contenido en módulos y lecciones. Adjunta PDFs, vídeos, enlaces. Publica solo cuando esté listo — los borradores son privados del profesor."
            />
            <Feature
              icon="🎥"
              title="Clases en vivo + grabaciones"
              body="Salas de videoconferencia integradas con visor dual sincronizado: muestra una presentación mientras das clase. Las grabaciones quedan disponibles automáticamente."
            />
            <Feature
              icon="📝"
              title="Tareas y cuestionarios"
              body="Crea tareas con fecha límite y penalización por entrega tardía. Cuestionarios con auto-corrección (opción múltiple, V/F, respuesta corta) y calificación manual de ensayos."
            />
            <Feature
              icon="💬"
              title="Chat en tiempo real"
              body="Mensajería directa entre profesores, estudiantes y padres. Sala automática por curso. Notificaciones in-app, email y push del navegador."
            />
            <Feature
              icon="👨‍👩‍👧"
              title="Vinculación familiar"
              body="Los padres pueden vincularse a la cuenta de su hijo (con aprobación) para ver sus cursos, notas, grabaciones y calendario. Privacidad respetada por diseño."
            />
            <Feature
              icon="📅"
              title="Calendario unificado"
              body="Clases en vivo, fechas de entrega, eventos personales y inicios de curso, todo en una vista mensual y de lista. Filtros por tipo."
            />
          </div>
        </div>
      </section>

      {/* ============================================ Roles */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">Para cada rol del centro</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
              Cuatro experiencias diseñadas a medida, sobre la misma plataforma.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <RoleCard
              label="Profesor"
              color="border-l-brand-500"
              points={[
                'Crea y publica cursos completos',
                'Aprueba o rechaza solicitudes de inscripción',
                'Califica tareas y deja feedback',
                'Imparte clases en vivo con presentaciones',
                'Mensajería con estudiantes y padres',
              ]}
            />
            <RoleCard
              label="Estudiante"
              color="border-l-emerald-500"
              points={[
                'Explora el catálogo de cursos',
                'Solicita inscripción y accede a materiales',
                'Realiza tareas y cuestionarios',
                'Asiste a clases en vivo o ve grabaciones',
                'Consulta notas y feedback en su panel',
              ]}
            />
            <RoleCard
              label="Padre / Madre"
              color="border-l-amber-500"
              points={[
                'Vincula tu cuenta a la de tu hijo',
                'Ve sus cursos, notas y materiales',
                'Accede a grabaciones de sus clases',
                'Calendario y horarios del estudiante',
                'Mensajería directa con los profesores',
              ]}
            />
            <RoleCard
              label="Administrador"
              color="border-l-rose-500"
              points={[
                'Control total del sistema (CRUD)',
                'Aprueba o rechaza nuevos profesores',
                'Gestiona usuarios y categorías',
                'Estadísticas y actividad en tiempo real',
                'Audit log de acciones sensibles',
              ]}
            />
          </div>
        </div>
      </section>

      {/* ============================================ CTA bottom */}
      <section className="border-t border-slate-200 bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Empieza hoy. Tu primera clase está a un clic.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-brand-100">
            Crea tu cuenta y empieza a construir tu primer curso. Si eres profesor, un administrador
            revisará tu solicitud y te activará.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex w-full items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-medium text-brand-700 shadow-md transition hover:bg-slate-100 sm:w-auto"
            >
              Crear cuenta
            </Link>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-base font-medium text-white transition hover:bg-white/10 sm:w-auto"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================ Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 py-8 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Education LMS. Todos los derechos reservados.</p>
          <p className="text-xs">
            Construido con Next.js, Prisma, PostgreSQL, LiveKit y Socket.IO.
          </p>
        </div>
      </footer>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{body}</p>
    </div>
  );
}

function RoleCard({
  label,
  color,
  points,
}: {
  label: string;
  color: string;
  points: string[];
}) {
  return (
    <div
      className={`rounded-xl border border-l-4 ${color} border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900`}
    >
      <h3 className="text-lg font-bold">{label}</h3>
      <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <span className="mt-0.5 text-brand-500" aria-hidden>
              ✓
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
