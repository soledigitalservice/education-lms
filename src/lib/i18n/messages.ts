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
};
