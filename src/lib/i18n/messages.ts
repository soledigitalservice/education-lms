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

  // ---- lesson page ----
  Contenido: 'Content',
  'Clase en vivo': 'Live class',
  'Cuando el profesor programe una sesión asociada a esta lección, aparecerá aquí el acceso para entrar a la sala. Mientras tanto, consulta el':
    'When the teacher schedules a session for this lesson, the access to join the room will appear here. Meanwhile, check the',
  calendario: 'calendar',
  'para ver las próximas clases del curso.': 'to see the upcoming course classes.',
  'Materiales ({n})': 'Materials ({n})',
  'Añadir material': 'Add material',

  // ---- lesson progress tracker ----
  '✓ Lección completada': '✓ Lesson completed',
  'Marcaste esta lección como completada. ¡Buen trabajo!':
    'You marked this lesson as completed. Well done!',
  'Marca la lección cuando termines para llevar el control de tu avance.':
    'Mark the lesson when you finish to keep track of your progress.',
  Desmarcar: 'Unmark',
  'Marcar como completada': 'Mark as completed',

  // ---- course analytics ----
  '← Volver al curso': '← Back to course',
  'Métricas en tiempo real de participación, entregas y rendimiento.':
    'Real-time metrics on participation, submissions and performance.',
  '{c} completados · {p} pendientes': '{c} completed · {p} pending',
  'Finalización media': 'Average completion',
  'Sin lecciones publicadas': 'No published lessons',
  '{f} al 100% · {n} lecciones': '{f} at 100% · {n} lessons',
  'Nota media': 'Average grade',
  '{n} calificación(es)': '{n} grade(s)',
  'Bajas / rechazos': 'Drops / rejections',
  'Inscripciones no activas': 'Inactive enrollments',
  'Distribución de calificaciones': 'Grade distribution',
  'media {a}% · mediana {m}%': 'avg {a}% · median {m}%',
  'sin datos': 'no data',
  'Porcentaje sobre la nota máxima de cada evaluación (tareas y cuestionarios numéricos).':
    "Percentage of each assessment's max score (numeric assignments and quizzes).",
  'Aún no hay calificaciones numéricas en este curso.':
    'There are no numeric grades in this course yet.',
  'Inscripciones por estado': 'Enrollments by status',
  '{n} solicitud(es) en total.': '{n} request(s) in total.',
  'Nadie ha solicitado inscripción todavía.': 'No one has requested enrollment yet.',
  Pendientes: 'Pending',
  Activos: 'Active',
  Completados: 'Completed',
  Rechazados: 'Rejected',
  'Dados de baja': 'Removed',
  'Rendimiento por evaluación': 'Performance by assessment',
  'Tareas y cuestionarios publicados, en orden de currículum. La tasa es sobre {n} alumno(s) activo(s).':
    'Published assignments and quizzes, in curriculum order. The rate is over {n} active student(s).',
  'No hay tareas ni cuestionarios publicados aún.': 'No assignments or quizzes published yet.',
  Evaluación: 'Assessment',
  Entregas: 'Submissions',
  'A tiempo / tarde': 'On time / late',
  Tarea: 'Assignment',
  'Progreso por lección': 'Progress by lesson',
  'Porcentaje de los {n} alumno(s) activo(s) que han completado cada lección, en orden de currículum. Útil para ver dónde se atascan o abandonan.':
    'Percentage of the {n} active student(s) who completed each lesson, in curriculum order. Useful to spot where they get stuck or drop off.',
  'No hay lecciones publicadas todavía.': 'No published lessons yet.',
  '{v} vista(s)': '{v} view(s)',
  'Solicitudes por semana': 'Requests per week',
  'Últimas 12 semanas · {n} en total.': 'Last 12 weeks · {n} in total.',
  'Asistencia a clases en vivo': 'Live class attendance',
  'Asistentes únicos por sesión sobre {n} alumno(s) activo(s).':
    'Unique attendees per session over {n} active student(s).',
  'No hay clases en vivo programadas en este curso.':
    'No live classes scheduled in this course.',
  'Actividad (últimos 30 días)': 'Activity (last 30 days)',
  'Entregas + intentos de cuestionario + mensajes del foro · {n} eventos.':
    'Submissions + quiz attempts + forum posts · {n} events.',
};
