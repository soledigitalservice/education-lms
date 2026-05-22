/**
 * English overrides. Keys are the Spanish source strings. Anything missing here
 * falls back to its Spanish key (graceful partial translation).
 *
 * Grows batch by batch as more surfaces are translated.
 */
export const en: Record<string, string> = {
  // ---- common / actions ----
  'Iniciar sesión': 'Sign in',
  'Crear cuenta': 'Create account',
  'Salir': 'Sign out',
  'Entrar': 'Sign in',
  'Ver →': 'View →',
  'Volver al login': 'Back to login',

  // ---- language toggle ----
  Idioma: 'Language',
  Español: 'Spanish',
  Inglés: 'English',

  // ---- landing ----
  'Enseña, aprende y conecta': 'Teach, learn and connect',
  'sin fricción': 'without friction',
  'La plataforma educativa todo-en-uno: cursos, clases en vivo, tareas y familias, en un solo lugar.':
    'The all-in-one education platform: courses, live classes, assignments and families, all in one place.',

  // ---- login ----
  '¿No tienes cuenta?': "Don't have an account?",
  'Crear una': 'Create one',
  'Correo electrónico': 'Email',
  'Contraseña': 'Password',
  'Correo no válido': 'Invalid email',
  'Introduce tu contraseña': 'Enter your password',
  'Datos inválidos': 'Invalid data',
  'Error inesperado. Intenta de nuevo.': 'Unexpected error. Please try again.',

  // ---- register ----
  '¿Ya tienes cuenta?': 'Already have an account?',
  'Inicia sesión': 'Sign in',
  'Nombre completo': 'Full name',
  'Tipo de cuenta': 'Account type',
  Estudiante: 'Student',
  'Padre / Madre': 'Parent',
  'Profesor (requiere aprobación del administrador)': 'Teacher (requires admin approval)',
  'Teléfono (opcional)': 'Phone (optional)',
  'Mínimo 10 caracteres, con mayúscula, minúscula y dígito.':
    'At least 10 characters, with an uppercase, a lowercase and a digit.',
  'Cuenta creada': 'Account created',
  'Mínimo 2 caracteres': 'At least 2 characters',
  'Mínimo 10 caracteres': 'At least 10 characters',
  'Debe contener una mayúscula': 'Must contain an uppercase letter',
  'Debe contener una minúscula': 'Must contain a lowercase letter',
  'Debe contener un dígito': 'Must contain a digit',

  // ---- app shell / nav ----
  Inicio: 'Home',
  Catálogo: 'Catalog',
  'Mis cursos': 'My courses',
  'Mis notas': 'My grades',
  Familia: 'Family',
  Mensajes: 'Messages',
  Calendario: 'Calendar',
  Ajustes: 'Settings',
  Usuarios: 'Users',
  Categorías: 'Categories',
  Estadísticas: 'Statistics',

  // ---- role labels ----
  Administrador: 'Administrator',
  Profesor: 'Teacher',

  // ---- dashboard: common ----
  'Buenos días': 'Good morning',
  'Buenas tardes': 'Good afternoon',
  'Buenas noches': 'Good evening',
  Atajos: 'Shortcuts',

  // ---- dashboard: teacher ----
  'Cursos publicados': 'Published courses',
  '{n} en borrador': '{n} in draft',
  'Alumnos activos': 'Active students',
  'en todos tus cursos': 'across all your courses',
  'Pendientes de calificar': 'Pending grading',
  'al día': 'up to date',
  'requieren tu atención': 'need your attention',
  'Solicitudes de inscripción': 'Enrollment requests',
  'sin pendientes': 'none pending',
  'esperando aprobación': 'awaiting approval',
  '+ Nuevo curso': '+ New course',
  'Próximas clases en vivo': 'Upcoming live classes',
  'No tienes clases programadas. Crea una desde la página del curso.':
    'You have no scheduled classes. Create one from the course page.',
  'Entrar ahora →': 'Join now →',
  'Solicitudes de inscripción pendientes': 'Pending enrollment requests',
  'solicitó acceso a': 'requested access to',
  'Revisar →': 'Review →',
  'Entregas pendientes de calificar': 'Submissions pending grading',
  'Entregado por {name}': 'Submitted by {name}',
  Tardía: 'Late',
  'Calificar →': 'Grade →',

  // ---- dashboard: student ----
  'Cursos activos': 'Active courses',
  'Entregas próximas': 'Upcoming due',
  'en los próximos 7 días': 'in the next 7 days',
  'Notas recibidas': 'Grades received',
  recientes: 'recent',
  'Clases en vivo': 'Live classes',
  'esta semana': 'this week',
  'Explorar catálogo': 'Browse catalog',
  'Próximas entregas': 'Upcoming assignments',
  '¡Nada vence en los próximos 7 días! Aprovecha para repasar materiales.':
    'Nothing is due in the next 7 days! Take the chance to review materials.',
  'vence en {h}h': 'due in {h}h',
  Entregada: 'Submitted',
  'Entregar →': 'Submit →',
  'Notas recientes': 'Recent grades',
  'Ver todas →': 'View all →',
  'Aún no tienes notas. Cuando el profesor califique tu primera entrega aparecerá aquí.':
    'You have no grades yet. When the teacher grades your first submission it will appear here.',
  Cuestionario: 'Quiz',
  'No hay clases programadas esta semana.': 'No classes scheduled this week.',
  'EN VIVO': 'LIVE',
  'Continuar aprendiendo': 'Continue learning',
  '{c}/{t} lecciones': '{c}/{t} lessons',
  'Sin lecciones aún': 'No lessons yet',
  'Repasar curso': 'Review course',
  Continuar: 'Continue',
  Empezar: 'Start',

  // ---- dashboard: parent ----
  'Hijos vinculados': 'Linked children',
  'Invitaciones pendientes': 'Pending invitations',
  'esperando aprobación del hijo': "awaiting the child's approval",
  'Cursos seguidos': 'Courses followed',
  'entre todos tus hijos': 'across all your children',
  'Tus hijos': 'Your children',
  'Aún no tienes vínculos aprobados. Ve a': 'You have no approved links yet. Go to',
  'para enviar una invitación a la cuenta de tu hijo.':
    "to send an invitation to your child's account.",
  'Ver panel →': 'View panel →',
  '{n} curso(s) activo(s)': '{n} active course(s)',

  // ---- dashboard: admin ----
  'Usuarios totales': 'Total users',
  'Profesores pendientes': 'Pending teachers',
  'Inscripciones activas': 'Active enrollments',
  'Entregas (24h)': 'Submissions (24h)',
  'actividad reciente': 'recent activity',
  'Gestionar usuarios': 'Manage users',
  'Salud de la plataforma': 'Platform health',
  'Estadísticas detalladas y métricas de engagement están disponibles en':
    'Detailed statistics and engagement metrics are available in',
  'el panel completo': 'the full dashboard',
  ': usuarios por rol, cursos por estado, actividad en tiempo real, audit log, etc.':
    ': users by role, courses by status, real-time activity, audit log, etc.',
  'Atención requerida': 'Attention required',
  'Hay {n} profesor(es) esperando que apruebes su cuenta.':
    'There are {n} teacher(s) waiting for you to approve their account.',
  'Revisar solicitudes →': 'Review requests →',

  // ---- course catalog ----
  'Catálogo de cursos': 'Course catalog',
  '{n} curso(s) publicado(s).': '{n} published course(s).',
  'Buscar por título o resumen...': 'Search by title or summary...',
  'Todas las categorías': 'All categories',
  Filtrar: 'Filter',
  'No hay cursos que coincidan con tu búsqueda.': 'No courses match your search.',
  '{n} alumno(s)': '{n} student(s)',
  '← Anterior': '← Previous',
  'Siguiente →': 'Next →',
  'Página {p} de {last}': 'Page {p} of {last}',

  // ---- course detail ----
  Borrador: 'Draft',
  Archivado: 'Archived',
  Por: 'By',
  '{n} alumno(s) activo(s)': '{n} active student(s)',
  Currículum: 'Curriculum',
  Analítica: 'Analytics',
  Alumnos: 'Students',
  Foro: 'Forum',
  Editar: 'Edit',
  'Contenido del curso': 'Course content',
  'Tu progreso': 'Your progress',
  '{c} de {t} lecciones': '{c} of {t} lessons',
  'El profesor aún no ha publicado módulos.': 'The teacher has not published any modules yet.',
  'El profesor está preparando las lecciones. Vuelve pronto.':
    'The teacher is preparing the lessons. Check back soon.',
  'Módulo {n}': 'Module {n}',
  'Sin lecciones todavía.': 'No lessons yet.',
  Completada: 'Completed',
  '{n} material(es)': '{n} material(s)',
  'Sobre el curso': 'About the course',
  'Sin descripción todavía.': 'No description yet.',
  'Bibliografía y recursos': 'Bibliography and resources',
  Detalles: 'Details',
  Inscripción: 'Enrollment',
  'Aprobación del profesor': 'Teacher approval',
  'Inscripción directa': 'Direct enrollment',
  Empieza: 'Starts',
  Termina: 'Ends',
  Publicado: 'Published',
};
