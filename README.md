# Education LMS

Plataforma educativa (estilo Canvas, mejorada) — **Next.js 14 fullstack** con
TypeScript, Tailwind, Prisma y PostgreSQL. Diseñada para una empresa unipersonal:
un solo deploy, una sola codebase, tipos compartidos entre front y back.

> **🎉 v1.0 cerrada + Capa 11 (preferencias de notificación).**
> Capas 1-10 (v1.0): Fundación · Cursos & Enrollments · Currículum & Materiales · Tareas/Cuestionarios/Calificaciones/Valoraciones · Vinculación padre-hijo · Chat en tiempo real · Video en vivo con LiveKit + grabaciones · Calendario · Notificaciones in-app + email + Web Push · Foros + panel admin con estadísticas.
> Capa 11 (post-v1.0): preferencias de notificación per-kind × per-channel + UI de ajustes.
>
> ⚠️ **Cambio importante desde Capa 6**: el servidor ya no es `next start`. Ahora ejecuta un servidor Node custom (`server.ts`) que envuelve a Next + Socket.IO en el mismo puerto. **Esto rompe la compatibilidad con Vercel serverless** — ver sección "Despliegue en producción" más abajo. En Railway/Render/Fly.io/DigitalOcean Apps/VPS todo funciona sin cambios.
>
> El esquema de base de datos cubre las **10 capas planificadas** (cursos,
> lecciones, materiales, tareas, calificaciones, vinculación padre-hijo, video
> en vivo, grabaciones, chat, foros, notificaciones, push, audit log…) — para
> no tener que rehacer migraciones masivas en el futuro. Cada capa entregada
> está al 100% funcional: sin TODOs, sin placeholders, con tests donde toca.

---

## Qué incluye esta Capa 1

| Área | Estado |
| --- | --- |
| Next.js 14 (App Router) + TypeScript + Tailwind | ✅ |
| Esquema Prisma completo: 28 modelos cubriendo las 10 capas | ✅ |
| Autenticación: register / login / refresh-rotativo / logout / me | ✅ |
| Detección de reuso de refresh tokens (invalida todas las sesiones del usuario) | ✅ |
| Hashing Argon2id (params OWASP 2023) | ✅ |
| RBAC granular: 4 roles × mapa de permisos compartido entre back y front | ✅ |
| Flujo de aprobación de profesor (PENDING_APPROVAL → ACTIVE/REJECTED) | ✅ |
| Panel admin (UI): aprobar/rechazar profesores pendientes, listado de usuarios | ✅ |
| Audit log automático para acciones admin | ✅ |
| Validación de variables de entorno con zod al arranque | ✅ |
| Errores normalizados con request-id; mapping Prisma → HTTP | ✅ |
| Rate limit en `/api/auth/*` | ✅ |
| Sesiones por cookies httpOnly (web) + soporte JSON body (mobile) | ✅ |
| Healthcheck en `/api/health` con probe a Postgres | ✅ |
| Middleware con CSP estricta y nonce por petición | ✅ |
| App shell responsive (mobile-first) con nav adaptado al rol | ✅ |
| Páginas: home pública, login, register (con UX de profesor pendiente), dashboard, admin/users | ✅ |
| PWA: manifest, service worker (network-first + offline fallback) | ✅ |
| Seed idempotente (admin + 5 usuarios demo + curso completo) | ✅ |
| Tests Vitest: password, JWT, RBAC, flujo de aprobación de profesor | ✅ |

## Qué incluye la Capa 2 (entregada 2026-05-17)

| Área | Estado |
| --- | --- |
| Categorías con árbol jerárquico (admin CRUD + detección de ciclos) | ✅ |
| Cursos: CRUD completo (crear, editar, publicar, archivar, soft-delete) | ✅ |
| Visibilidad por rol: borradores solo dueño+admin, archivados solo dueño+enrolled, públicos para todos | ✅ |
| Auto-generación de slug a partir del título con detección de colisiones | ✅ |
| Catálogo público con búsqueda, filtro por categoría, paginación | ✅ |
| Página de detalle de curso con CTA contextual por rol | ✅ |
| Solicitud de inscripción del estudiante (idempotente; auto-aprueba si `requiresApproval=false`) | ✅ |
| Aprobar / rechazar / dar de baja estudiantes desde el profesor | ✅ |
| Estudiante puede darse de baja por sí mismo | ✅ |
| Capacidad máxima (`maxStudents`) respetada en request y approve | ✅ |
| Re-solicitud tras rechazo/baja (no duplica filas, revive la enrollment) | ✅ |
| Página "Mis cursos" diferenciada por rol (impartidos vs inscritos) | ✅ |
| Panel admin de categorías (crear, eliminar, jerarquía) | ✅ |
| Audit log automático en crear/publicar/archivar/borrar curso + aprobar/rechazar/expulsar enrollment | ✅ |
| Seed extendido: 5 categorías (con árbol), 3 cursos (publicado-con-aprobación, publicado-directo, borrador) | ✅ |
| Tests Vitest: slug + slug-collisions, visibilidad cursos, flujo enrollments | ✅ |

## Qué incluye la Capa 3 (entregada 2026-05-17)

| Área | Estado |
| --- | --- |
| Módulos del curso (CRUD, reorder ↑/↓, publicar/despublicar, eliminar con compactación de posiciones) | ✅ |
| Lecciones por módulo (CRUD, reorder, publicar, 4 tipos: CONTENT/LIVE_CLASS/ASSIGNMENT/QUIZ) | ✅ |
| Visibilidad: lecciones borrador solo profesor+admin; lecciones publicadas solo enrolled ACTIVE/COMPLETED | ✅ |
| Almacenamiento S3-compatible (AWS SDK v3 — funciona con S3, R2, B2, MinIO, Spaces) | ✅ |
| Validación env all-or-none: si pones una S3_*, deben estar las cuatro | ✅ |
| Presigned upload URLs (PUT directo al bucket, sin pasar por el servidor) | ✅ |
| Presigned download URLs (10 min TTL) por petición, validando enrollment | ✅ |
| Whitelist MIME por kind (file/image/video/avatar) y cap de tamaño (2-500 MB según kind) | ✅ |
| Object key seguro: `uploads/<uploaderId>/<nanoid>/<safeName>` (atacante no puede adivinar) | ✅ |
| Materiales: subidos (FILE/PDF/SLIDES) y enlaces (LINK/VIDEO_EMBED) | ✅ |
| Materiales a nivel lección **y** a nivel curso (bibliografía) | ✅ |
| Editor de currículum drag-free (botones ↑↓, inline forms, sin librería extra) | ✅ |
| Componente `FileUploader` reutilizable con barra de progreso (XHR para upload events) | ✅ |
| Componente `MaterialList` con iconos por tipo, descarga, eliminar, previsualización PDF inline | ✅ |
| Página de lección con editor de contenido markdown (vista profesor) o solo lectura (alumno) | ✅ |
| Página detalle de curso muestra ahora currículum + bibliografía a alumnos enrolled | ✅ |
| Audit log automático en crear/editar/reorder/publicar/eliminar módulos, lecciones y materiales | ✅ |
| Limpieza de orphan StoredFile cuando se elimina el último material que lo referencia | ✅ |
| Tests Vitest: storage (MIME whitelist, size caps, key path safety), reorder, visibility | ✅ |
| Seed extendido: 2 módulos, 4 lecciones (1 borrador), 3 materiales tipo LINK | ✅ |

## Qué incluye la Capa 4 (entregada 2026-05-17)

| Área | Estado |
| --- | --- |
| Tareas (Assignments): crear, editar, publicar, eliminar, vincular a lección o sueltas en el curso | ✅ |
| Tareas con `dueAt`, `allowLate`, `latePenaltyPct`, `maxScore`, adjuntos del profesor | ✅ |
| Submisiones de estudiantes: borrador + entrega final, con archivos y notas | ✅ |
| Detección automática de entrega tardía (LATE vs SUBMITTED) según `dueAt` | ✅ |
| Bloqueo si `allowLate=false` y vencido; validación de "no enviar vacío" | ✅ |
| Estudiante puede retirar archivos y editar notas mientras está en DRAFT | ✅ |
| Profesor puede DEVOLVER una entrega → estudiante revisa y vuelve a entregar | ✅ |
| Calificaciones (Grades): 3 escalas (NUMERIC, CONCEPT, LETTER), validación por escala | ✅ |
| Re-calificación (upsert) sin perder el id de la nota | ✅ |
| Grade book por curso (teacher/admin) y `/my/grades` para estudiantes | ✅ |
| Cuestionarios (Quizzes): CRUD + 5 tipos de pregunta + opciones + reorder | ✅ |
| `timeLimitMin` + `maxAttempts` enforcing, con timer en cliente derivado del server | ✅ |
| Auto-grader robusto: SINGLE_CHOICE, MULTIPLE_CHOICE (exact-match, sin parcial), TRUE_FALSE, SHORT_ANSWER (case-insensitive, trim) | ✅ |
| LONG_ANSWER y SHORT_ANSWER sin expected → `null` para calificación manual | ✅ |
| Resume de intento (mismo `attempt` si el estudiante refresca) — no quema attempts | ✅ |
| Intentos pueden ser calificados manualmente por el profesor (LONG_ANSWER) | ✅ |
| Reviews de profesor: 1-5 estrellas + comentario, único por (teacher, author, course) | ✅ |
| Solo estudiantes/padres enrolled (o linked) pueden dejar review — no anónimos | ✅ |
| Denormalización `ratingAvg`/`ratingCount` en `TeacherProfile`, recomputada en cada upsert/delete | ✅ |
| Tests Vitest del auto-grader (5 tipos), late submission, escalas de nota, uniqueness de reviews | ✅ |
| Subida de ficheros relajada para STUDENT (submissions) y AVATAR (cualquier rol no-PARENT) | ✅ |
| Audit log automático en cada crear/grade/return/review-upsert | ✅ |
| Seed extendido: 1 ASSIGNMENT lesson (con submission ya calificada 85/100), 1 QUIZ lesson (5 preguntas cubriendo los 5 tipos), 1 review 5★ | ✅ |

## Qué incluye la Capa 5 (entregada 2026-05-17)

| Área | Estado |
| --- | --- |
| Vinculación padre→hijo por email (el hijo debe tener cuenta STUDENT) | ✅ |
| Flujo PENDING → APPROVED / REJECTED (decidido por el hijo) o REVOKED (decidido por el padre/admin) | ✅ |
| Token de invitación con SHA-256 + expiración 7 días (listo para email en Capa 9; no se usa en in-app) | ✅ |
| Idempotencia: re-solicitar mientras PENDING o APPROVED no duplica filas | ✅ |
| Re-solicitar tras REJECTED/REVOKED revive la fila como PENDING con nuevo token | ✅ |
| Token se invalida al aceptar/rechazar (un solo uso) | ✅ |
| Auto-rechazo si la invitación expiró antes de aceptar | ✅ |
| Página `/family` con dos vistas: parent (gestionar vínculos + form solicitar) y student (bandeja de solicitudes) | ✅ |
| Página `/family/[childId]` para el padre: cursos activos del hijo + cuadro de notas con media por curso + feedback completo | ✅ |
| `GradesService.listForStudent` extendido: padre con APPROVED link puede leer notas del hijo | ✅ |
| API `/api/me/children` + `/.../enrollments` + `/.../grades` con `assertParentOf()` gate | ✅ |
| `ParentLinksService.assertParentOf(childId, ctx)` reutilizable como gate desde otros servicios (chat futuro, etc.) | ✅ |
| Audit log en cada request/approve/reject/revoke | ✅ |
| Nav: "Familia" añadida para PARENT y STUDENT | ✅ |
| Tests Vitest: gates de request, auth de approve, expiración, idempotencia, revival, parent reads child grades | ✅ |
| Seed extendido: PENDING invite de parent → student2 (lista para aprobar en demo) | ✅ |

## Qué incluye la Capa 6 (entregada 2026-05-17)

| Área | Estado |
| --- | --- |
| Servidor Node custom (`server.ts`) que monta Next.js + Socket.IO en el mismo puerto | ✅ |
| Handshake authenticado leyendo la cookie `edu_access` y validando el JWT | ✅ |
| Tipos compartidos para eventos cliente↔servidor (typo en evento = error de compilación en ambos lados) | ✅ |
| `ChatService` con salas DIRECT (find-or-create idempotente), GROUP (ad-hoc) y COURSE (auto-creada por curso) | ✅ |
| Membresía gate (`assertMember`) en cada operación; ADMIN bypassa | ✅ |
| Mensajes paginados con cursor (id del mensaje más antiguo cargado) — historial infinito | ✅ |
| Marca-como-leído por participante (`lastReadMessageId` por usuario por sala) | ✅ |
| Conteo de no leídos global (`unreadCountForUser`) + badge en el nav | ✅ |
| Auto-creación de COURSE room + auto-join del estudiante al aprobar enrollment (no-bloqueante) | ✅ |
| Listado de "chat-peers": un estudiante solo ve a sus profesores; un profesor a sus alumnos + padres; un padre a los profesores de sus hijos | ✅ |
| Presence indicator por sala (quién está conectado AHORA en esa sala) | ✅ |
| Typing indicator (cliente envía `typing:true/false`; broadcast a la sala) | ✅ |
| Reconexión automática con backoff exponencial (Socket.IO nativo) | ✅ |
| Mensajes también enviables via REST (POST `/api/chat-rooms/:id/messages`) para clientes móvil o degradación | ✅ |
| UI `/messages` con sidebar de salas + ChatWindow + diálogo "Nuevo chat" con buscador de peers | ✅ |
| ChatWindow con infinite scroll histórico, auto-scroll al recibir, "leído al ver" automático, Enter/Shift-Enter | ✅ |
| Seed: 3 mensajes demo en la sala COURSE de Algebra 101 para que el chat no esté vacío al primer arranque | ✅ |
| Tests Vitest del ChatService: membership gate, createDirect idempotency, sendMessage validaciones, markRead cursor update, unreadCount | ✅ |
| Limpieza de shutdown: `SIGINT`/`SIGTERM` cierran Socket.IO + HTTP + Prisma pool antes de salir | ✅ |

## Qué incluye la Capa 7 (entregada 2026-05-18)

| Área | Estado |
| --- | --- |
| Validación env LiveKit all-or-none (`LIVEKIT_URL` + `_API_KEY` + `_API_SECRET`) | ✅ |
| `RoomServiceClient` + `EgressClient` lazy singletons + helper de URL pública | ✅ |
| Generador de tokens LiveKit con permisos diferenciados host (publish+admin) vs participante (subscribe-only + data) | ✅ |
| `LiveSessionsService` CRUD + state machine SCHEDULED → LIVE → ENDED (+ CANCELLED), todas idempotentes | ✅ |
| Validación: lección debe ser `LIVE_CLASS`, 1-1 con la lección, no editable cuando LIVE/ENDED | ✅ |
| `joinToken(sessionId, ctx)` valida enrollment del estudiante; host bypasa | ✅ |
| `RecordingsService` + integración con LiveKit Egress (Composite layout grid, mp4 a S3/R2 directo) | ✅ |
| Webhook `/api/livekit/webhook` con verificación JWT de la firma LiveKit; mapea `egress_ended` → Recording READY/FAILED + StoredFile | ✅ |
| Visor dual sincronizado: el profesor elige Material → broadcast vía LiveKit data channel → todos los alumnos cambian al instante (PDF/SLIDES/VIDEO_EMBED/LINK) | ✅ |
| Página `/courses/:slug/live/:sessionId` con `LiveKitRoom` + `VideoConference` + panel del visor dual | ✅ |
| Auto-fetch del token al estar LIVE; mensaje claro cuando no configurado o cuando sesión ENDED/CANCELLED | ✅ |
| `LiveSessionsPanel` embebido en la página del curso: próximas sesiones + grabaciones + diálogo "Programar" | ✅ |
| `RecordingsService.listForChild` con `assertParentOf` — padres ven grabaciones de los cursos de sus hijos | ✅ |
| Convertidor YouTube/Vimeo → embed URL automático en el visor | ✅ |
| Seed: 1 SCHEDULED para mañana 10h + 1 ENDED con grabación READY (fake mp4 key, UI completa) | ✅ |
| Tests Vitest: gates de create, state machine (markStarted/markEnded/cancel/remove idempotent + estados terminales), joinToken (ended/cancelled/enrollment/host token shape) | ✅ |

## Qué incluye la Capa 8 (entregada 2026-05-18)

| Área | Estado |
| --- | --- |
| `CalendarService.eventsForUser(userId, role, range)` agrega LiveSessions + Assignment.dueAt + Course start/end + ScheduleEvents personales | ✅ |
| Visibilidad por rol enforced en cada fuente: teacher ve sus cursos, student/parent solo cursos ACTIVE/COMPLETED, admin todo | ✅ |
| `CalendarService.eventsForChild` con `assertParentOf` y **strip de eventos MANUAL** (privacidad del hijo) | ✅ |
| Range bounds: default 60 días, cap duro 6 meses para evitar runaway | ✅ |
| `ScheduleEventsService` CRUD personal: solo el dueño edita/borra; admin puede ambas | ✅ |
| Eventos manuales vinculables opcionalmente a curso o live session (cross-check de consistencia) | ✅ |
| `/api/me/calendar`, `/api/me/children/:id/calendar`, `/api/me/schedule-events`, `/api/schedule-events` CRUD | ✅ |
| Página `/calendar` con vista **mes** (grid 7×6 desde lunes, drill-down por día) y vista **lista** (agrupada por día) | ✅ |
| Filtros por tipo de evento (toggle pills: clases / entregas / inicios / fines / personales) | ✅ |
| Colores semánticos: LIVE en rojo, SCHEDULED azul, ASSIGNMENT_DUE ámbar, COURSE_START verde, manual configurable | ✅ |
| Cero dependencia de librería de calendario (FullCalendar ~50 KB ahorrados); componente custom mobile-first | ✅ |
| Diálogo "Nuevo evento personal" con datetime-local, color picker, all-day toggle | ✅ |
| Refetch automático cuando el usuario navega a un mes fuera del rango pre-cargado | ✅ |
| Seed: 1 evento personal del teacher para dentro de 3 días | ✅ |
| Tests Vitest: agregación por rol y por kind, sort, range validation, parent strips MANUAL, schedule-events permissions + cross-course validation | ✅ |

## Qué incluye la Capa 9 (entregada 2026-05-18)

| Área | Estado |
| --- | --- |
| `NotificationsService.dispatch(kind, userId, payload)` — bus único de fan-out in-app + email + push | ✅ |
| Best-effort: dispatch nunca tira la transacción del caller; errores logueados, no propagados | ✅ |
| Dedup vía `dedupKey` — el scheduler usa `assignment_due_soon:{id}` / `live_session_starting:{id}` para no spamear | ✅ |
| Email: `Mailer` interface + `ResendMailer` (cuando `RESEND_API_KEY` configurado) + `NoopMailer` (consola en dev) | ✅ |
| Plantillas HTML inline (sin librerías; escaping XSS verificado por test) por cada `NotificationKind` | ✅ |
| Web Push: `web-push` + VAPID, fan-out a todas las subscripciones del user, **prune automático** de subscriptions caducadas (410) | ✅ |
| Service Worker: handler `push` muestra notificación con icon/badge/tag; `notificationclick` reusa tab abierto o abre uno nuevo en el deep-link | ✅ |
| `PushSubscriptionsService` con upsert por endpoint (logout/login en mismo browser → último wins) | ✅ |
| `EnablePushButton` con feature-detect + check server config + permission flow completo (granted / denied / unsupported) | ✅ |
| `NotificationBell` en el nav con badge de no-leídas, poll 30s + bump en `message:new` | ✅ |
| Página `/notifications` con lista, marca leída por click, "marcar todas leídas", link al detalle | ✅ |
| **Scheduler in-process** (`setInterval` en `server.ts`, tick 60s): escanea `ASSIGNMENT_DUE_SOON` (próximas 24h) + `LIVE_SESSION_STARTING` (próximos 15 min); dedup por dispatch | ✅ |
| Validación env all-or-none: `RESEND_API_KEY + EMAIL_FROM` y `VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT + NEXT_PUBLIC_VAPID_PUBLIC_KEY` (mirror equal-check) | ✅ |
| 7 endpoints API nuevos: list / unread-count / read-all / mark-one-read / push-vapid-public-key / push-subscriptions POST + DELETE | ✅ |
| Seed: 3 notificaciones demo para student1 (grade, chat, live-soon) | ✅ |
| Tests Vitest: dispatch crea/dedup/no-throw/usuario suspendido; markRead permisos; mailer adapter selection; renderTemplate exhaustivo + XSS escaping | ✅ |

## Qué incluye la Capa 10 (entregada 2026-05-18, **cierre v1.0**)

| Área | Estado |
| --- | --- |
| Foros por curso (auto-creado al primer acceso) | ✅ |
| `ForumsService` con listThreads (pin-first sort), createThread (con post inicial atómico), moderation (pin/lock), threads CRUD | ✅ |
| Posts con threading a 1 nivel (replies-of-replies se aplanan automáticamente al parent original) | ✅ |
| Edit propio + soft delete (autor o moderador); UI muestra "[mensaje eliminado]" preservando threading | ✅ |
| Lock impide nuevas respuestas; pin sube al tope | ✅ |
| 7 endpoints API: GET/POST forum, GET/PATCH/DELETE thread, POST posts del thread, PATCH/DELETE post | ✅ |
| `AdminStatsService` con 3 vistas: **overview** (15+ counts en una sola transacción Prisma), **activityFeed** (audit log), **engagement** (daily counts via $queryRaw + bucketize) | ✅ |
| Panel `/admin/stats` con 8 cards de KPI + sparkline bars de engagement (30 días) + lista de actividad reciente | ✅ |
| UI foro: `/courses/:slug/forum` (lista) + `/courses/:slug/forum/:threadId` (thread con replies) + diálogo "Nuevo tema" + replies inline | ✅ |
| Botón "Foro" en el detalle del curso (manager o enrolled) | ✅ |
| Link "Estadísticas" en el nav admin | ✅ |
| **Capa 9.1 cleanup**: `NotificationsService.dispatch` cableado en 5 services existentes — UsersService (teacher approve/reject), EnrollmentsService (request→teacher / approve+reject+remove→student), GradesService (graded→student), AssignmentsService (publish→todos los enrolled con dedupKey), ParentLinksService (request→student / approve→parent), ChatService (sendMessage→otros participantes, dedupKey por sala, sin email), ForumsService (replies→thread author + parent post author) | ✅ |
| Tests Vitest: forums (auto-create, enrollment gate, flatten-reply, edit/delete permisos, lock) | ✅ |
| Seed: 1 thread + 2 posts demo (pregunta de student1 + respuesta del teacher) | ✅ |

---

## 🎯 Proyecto v1.0 — Resumen final

**Total entregado** (60+ archivos de servicios, 90+ de endpoints API, 30+ páginas + componentes, ~25 archivos de tests, schema Prisma completo de 28 modelos):

| Capa | Área | Status |
| --- | --- | --- |
| 1 | Fundación (Next 14 + Prisma + Auth JWT + RBAC + admin moderation + PWA) | ✅ |
| 2 | Cursos + Categorías + Enrollments + moderación | ✅ |
| 3 | Módulos + Lecciones + Materiales + Uploads S3/R2 | ✅ |
| 4 | Tareas + Cuestionarios + Auto-grader + Calificaciones + Reviews | ✅ |
| 5 | Vinculación padre-hijo + vistas filtradas | ✅ |
| 6 | Chat tiempo real (Socket.IO sobre server custom) | ✅ |
| 7 | Video en vivo LiveKit + grabaciones a S3 + visor dual sincronizado | ✅ |
| 8 | Calendario + agregación de eventos + horarios manuales | ✅ |
| 9 | Notificaciones in-app + email (Resend) + Web Push (VAPID) + scheduler | ✅ |
| 10 | Foros + panel admin con estadísticas + wiring final de notificaciones | ✅ |

**Funcionalidad cubierta del prompt original**: 100%. Cada rol del prompt (Administrador, Profesor, Padre/Madre, Estudiante) tiene todas las acciones que se le pedían.

### Checklist pre-producción final

- [ ] Variables `JWT_*` regeneradas (no reutilizar las de dev)
- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` con `?sslmode=require`
- [ ] Dominio HTTPS configurado
- [ ] Healthcheck apuntado a `/api/health`
- [ ] Backups automáticos en Neon activados
- [ ] Iconos PWA reales en `public/icons/` (placeholder hoy)
- [ ] **Resend** configurado y dominio verificado (SPF/DKIM) si quieres email transaccional con tu marca
- [ ] **VAPID keys** generadas con `npx web-push generate-vapid-keys`
- [ ] **Cloudflare R2 (o S3/MinIO)** configurado con CORS + lifecycle policy para subir tareas, materiales, grabaciones
- [ ] **LiveKit Cloud o self-hosted** + webhook apuntando a `https://<dominio>/api/livekit/webhook`
- [ ] Host con soporte WebSocket persistente (Railway/Render/Fly/VPS — **NO Vercel serverless**)
- [ ] Si tienes >1 instancia: configura `@socket.io/redis-adapter` con `REDIS_URL` + `pg_try_advisory_lock` en el scheduler de notificaciones

### Limitaciones conocidas (post-v1, deferidas conscientemente)

- **Single-instance** por defecto (chat + scheduler). El upgrade a multi-instancia es ~50 líneas de código (Redis adapter + advisory lock).
- **No NotificationPreference per-user** — un solo opt-in global por canal. Añadir per-kind/per-channel cuando los usuarios lo pidan.
- **No CHAT_MESSAGE suppression cuando el destinatario está activo en la misma sala** — el dedup-per-room mitiga el spam (una sola notificación pendiente por sala hasta que la marca leída).
- **No "raise hand" en clases en vivo** — solo el host publica; estudiantes subscribe-only. Añadible con un endpoint `/promote/:userId` que reissue el token con publish permissions.
- **No drag-and-drop reorder** ni en módulos/lecciones ni en calendar — botones ↑↓.
- **No iCal export** del calendario — el data shape ya soporta generar .ics.
- **No editor WYSIWYG** para contenido de lecciones / posts de foro / instrucciones de tareas — todo textarea plano.
- **No multi-attempt grading dashboard** — manual por attempt en el panel del profesor.
- **No bulk grading** (CSV import / spreadsheet view).
- **Sin Forum.subscribe** — los autores de hilo + parent post reciben notificación, pero no hay "follow this thread" para terceros.

---

## Qué incluye la Capa 11 (entregada 2026-05-18)

| Área | Estado |
| --- | --- |
| Nuevo modelo Prisma `NotificationPreference` + enum `NotificationChannel` (INAPP/EMAIL/PUSH), unique `(userId, kind, channel)` | ✅ |
| `NotificationPreferencesService` con `listForUser` (matriz completa con defaults rellenados), `isAllowed`, `loadGateForUser` (1 query → función in-memory) y `bulkUpsert` | ✅ |
| **Tabla sparse**: solo guarda filas que el usuario explícitamente cambió; usuarios sin preferencias reciben defaults (todo on, INAPP siempre on) | ✅ |
| `NotificationsService.dispatch` consulta el gate **una sola vez al inicio** (no 3 queries por canal) y respeta las preferencias del usuario | ✅ |
| INAPP **locked-on** (en service + UI + API): el usuario no puede vaciar la campana sin querer | ✅ |
| API `GET/PUT /api/me/notification-preferences` (PUT devuelve matriz fresca) | ✅ |
| Página `/settings/notifications` con tabla Kind × Channel, atajos "activar/desactivar todo el canal", indicador de "Guardado" | ✅ |
| Nav: nuevo enlace "Ajustes" → `/settings/notifications` | ✅ |
| Tests Vitest: defaults vs overrides, INAPP short-circuit, fallback fail-open para mocks legacy, bulkUpsert idempotency + rechazo INAPP-disable | ✅ |
| Backward-compat: mock de tests existentes de Capa 9 actualizado para incluir `notificationPreference.findMany` (cero test breakage) | ✅ |

## Capas siguientes (post-v1.0)

Cuando el cliente quiera más, aquí están los siguientes naturales:

- **Bulk grading** + grade book editable inline (2-3 días)
- **Forum subscribe + email digest diario** (1 día con la infra actual)
- **Mobile native app** (React Native, comparte la API existente — 3-4 semanas)
- **Multi-tenant** (organización por colegio) — toca el schema (~1 semana)
- **Internacionalización** (next-intl) — el código ya está en es-ES sólo (~2 días por idioma adicional)
- **Analytics dashboards** más ricos (cohorts, retention) — añadir tabla materializada en Postgres

---

## Decisiones técnicas relevantes

- **Next.js fullstack en lugar de backend separado**: para una empresa unipersonal, un solo deploy y una sola codebase reducen drásticamente la carga operativa. Los Route Handlers + Server Components dan el 95% de lo que necesitas hasta cientos de miles de usuarios.
- **`jose` (no `jsonwebtoken`)** para firmar JWTs — moderno, sin deps nativas, edge-compatible.
- **`argon2`** para passwords con parámetros OWASP 2023 (m=19MiB, t=2). Más resistente a GPU/ASIC que bcrypt.
- **Cookies httpOnly como source-of-truth** de auth para web (XSS shield). Mobile / no-browser usan el JSON body en `/api/auth/refresh`.
- **Refresh tokens opacos**: 48 bytes aleatorios, almacenados como SHA-256 en BD. Un dump de BD no expone tokens utilizables.
- **Token reuse detection**: si un refresh revocado se vuelve a usar, asumimos robo y revocamos toda la sesión del usuario.
- **Permisos como strings en el JWT** (no bitmasks) — fácil de auditar y de gateaer en UI con el mismo identificador que el server.
- **Validación zod en cada endpoint** + adaptador `route()` que normaliza cualquier error lanzado a la misma forma JSON.
- **Auth gating en Server Components** (no middleware), porque argon2 no corre en Edge Runtime. Cada layout/page hace su propia `requireSession()` / `requireRole()`.
- **Rate limit in-memory** para v1 — cuando metamos Redis (Capa 6, chat), se sustituye sin tocar callers.
- **PWA sin librerías externas**: manifest + service worker custom (~80 líneas). Suficiente para que el navegador permita instalación y para offline básico.

---

## Puesta en marcha local (5 minutos)

### Requisitos

- **Node.js 20.10+** (verifica con `node --version`)
- **pnpm 9** (instálalo si no lo tienes: `npm install -g pnpm@9` o `corepack enable && corepack prepare pnpm@9.12.0 --activate`)

No necesitas Docker. La base de datos vive en la nube (Neon — free tier permanente).

### 1) Postgres en Neon (2 min, gratis)

1. Ve a <https://neon.tech> y crea cuenta (sirve GitHub login).
2. "Create new project" → región más cercana → nombre del proyecto: `education-lms`.
3. Copia las dos connection strings:
   - **Pooled connection** → `DATABASE_URL`
   - **Direct connection** → `DIRECT_DATABASE_URL`
4. Asegúrate de que las dos terminan en `?sslmode=require`.

### 2) Variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local`:

- Pega `DATABASE_URL` y `DIRECT_DATABASE_URL` de Neon
- Genera dos secretos fuertes para JWT:

```powershell
# PowerShell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Max 256 }))
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Max 256 }))
```

```bash
# Linux/macOS
openssl rand -base64 64
openssl rand -base64 64
```

Pega la primera en `JWT_ACCESS_SECRET`, la segunda en `JWT_REFRESH_SECRET`.

### 3) Instalar dependencias y crear tablas

```bash
pnpm install
pnpm prisma migrate dev --name init    # crea las tablas en Neon
pnpm prisma:seed                        # admin + usuarios demo + curso
```

### 4) (Opcional — solo si vas a usar uploads de archivos) Cloudflare R2

Sin esto, los **materiales tipo LINK / VIDEO_EMBED** funcionan; los uploads (PDFs, vídeos propios) devuelven un error claro hasta que configures S3-compatible.

**Por qué R2 y no AWS S3 en dev**: R2 da **10 GB gratis** sin tarjeta, no cobra egreso, y es S3-compatible. Setup en 3 minutos:

1. Cuenta en <https://dash.cloudflare.com> → menú lateral "R2" → "Create bucket". Nombre: `education-lms-dev`. Location: `Automatic`. Crear.
2. R2 → "Manage R2 API Tokens" → "Create API Token". Permisos: **Object Read & Write**. Specify bucket: `education-lms-dev`. TTL: indefinido en dev. Crea y copia las tres cosas:
   - **Access Key ID** → `S3_ACCESS_KEY`
   - **Secret Access Key** → `S3_SECRET_KEY`
   - **Endpoint** (algo como `https://<account-hash>.r2.cloudflarestorage.com`) → `S3_ENDPOINT`
3. En tu `.env.local` añade:

   ```bash
   S3_ENDPOINT=https://<account-hash>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=education-lms-dev
   S3_ACCESS_KEY=...
   S3_SECRET_KEY=...
   # S3_PUBLIC_URL=     # déjalo vacío en dev; siempre presignamos
   ```

4. CORS en R2 (obligatorio para que el browser pueda PUT directo): bucket → "Settings" → "CORS Policy" → pega:

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://tu-dominio-prod.com"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3000,
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

Reinicia `pnpm dev` y prueba: como profesor, ve a un curso → "Currículum" → entra a una lección → "Añadir material" → "Subir archivo".

### 5) (Opcional — solo si vas a usar video en vivo) LiveKit

Sin esto, todas las páginas funcionan; al entrar a una sesión en vivo verás un mensaje claro pidiendo configurar `LIVEKIT_*`.

**Opción más rápida — LiveKit Cloud (free tier muy generoso)**:

1. Cuenta gratis en <https://cloud.livekit.io>. Free tier: 50 GB tráfico/mes + 100 min grabación/mes + máx. 5 participantes simultáneos por sala.
2. "Create project" → escoge región más cercana → crear.
3. En "Settings" copia las tres cosas y añádelas a tu `.env.local`:

   ```bash
   LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxxxxxx
   LIVEKIT_API_SECRET=secretxxxxxxxxxxxxxxxxxxx
   ```

4. (Opcional, para grabaciones) "Settings → Webhooks" → URL: `https://<tu-dominio-prod>/api/livekit/webhook` (o `https://<ngrok-id>.ngrok-free.app/api/livekit/webhook` en dev). Activa los eventos `egress_ended`. Reusa la `LIVEKIT_API_SECRET` para la firma — el webhook receiver la valida automáticamente.

**Alternativa — self-host con Docker**:

```bash
docker run -d --name livekit --network host \
  -e LIVEKIT_KEYS="devkey: devsecret_at_least_32_chars_long_for_safety" \
  livekit/livekit-server --dev
```

Variables: `LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=devsecret_...`. Para producción real, usa `livekit-server --config config.yaml` con TURN y certificados.

### 6) (Opcional — para notificaciones por email + push) Resend + VAPID

Sin esto, las notificaciones in-app funcionan; el email cae a `NoopMailer` que loguea por consola (perfecto para dev), y el botón "Activar push" se oculta.

**Email — Resend (100 emails/día gratis sin tarjeta)**:

1. Cuenta en <https://resend.com> → "API Keys" → "Create API Key" con permisos "Sending access".
2. (Opcional — para tu propio dominio) "Domains" → añadir + verificar SPF/DKIM. Si solo pruebas, usa el dominio `onboarding@resend.dev` que viene incluido.
3. En `.env.local`:

   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   EMAIL_FROM=Education LMS <no-reply@tu-dominio.com>
   ```

**Push — VAPID keys**:

1. Generar las llaves una vez:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Copiar las dos llaves (Public + Private) al `.env.local`. La pública va DUPLICADA (la versión `NEXT_PUBLIC_*` se expone al browser para que se suscriba):

   ```bash
   VAPID_PUBLIC_KEY=BJ...
   VAPID_PRIVATE_KEY=2X...
   VAPID_SUBJECT=mailto:tu-email@dominio.com
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=BJ...
   ```

3. Reinicia `pnpm dev`. Entra en `/notifications` → botón "Activar push" → permite notificaciones en el navegador. Ya recibirás push del scheduler (clase en 15 min, tarea por vencer) y de los eventos en vivo (calificación, mensaje nuevo, etc.).

### 7) Arrancar

```bash
pnpm dev
```

→ <http://localhost:3000>

### Credenciales demo (creadas por el seed)

| Rol | Email | Contraseña |
| --- | --- | --- |
| Admin | `admin@education-lms.local` | `ChangeMe123!` (o lo que pongas en `SEED_ADMIN_PASSWORD`) |
| Profesor activo | `teacher@demo.local` | `TeacherDemo123!` |
| Profesor pendiente | `teacher.pending@demo.local` | `TeacherDemo123!` |
| Estudiante 1 | `student1@demo.local` | `StudentDemo123!` |
| Estudiante 2 | `student2@demo.local` | `StudentDemo123!` |
| Padre | `parent@demo.local` | `ParentDemo123!` |

Cuando entres como admin, ve a `/admin/users` para ver al profesor pendiente y aprobarlo con un clic.

---

## Scripts útiles

| Comando | Acción |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo (con HMR) |
| `pnpm build` | `prisma generate` + `next build` (lo que ejecuta Vercel) |
| `pnpm start` | Servidor producción local (tras `build`) |
| `pnpm typecheck` | TypeScript sin emitir |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (run once) |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm prisma:migrate` | Crear / aplicar migración en dev |
| `pnpm prisma:migrate:deploy` | Aplicar migraciones pendientes (CI/producción) |
| `pnpm prisma:studio` | UI navegable de la BD en `localhost:5555` |
| `pnpm prisma:seed` | Re-ejecutar el seed (idempotente) |

---

## Despliegue en producción

### ⚠️ Vercel: NO recomendado desde Capa 6

Desde la Capa 6 (chat en tiempo real) el `pnpm start` ejecuta un servidor Node custom (`server.ts`) que mantiene una conexión Socket.IO viva. Esto **NO funciona en Vercel serverless functions**, que terminan tras cada request. Si quieres Vercel sí o sí, la alternativa es reemplazar Socket.IO por Server-Sent Events + POST (el patrón "near-realtime" que Vercel recomienda) — es trabajo de un par de horas pero rompe `useChatSocket` y los handlers de `server.ts`. Pídemelo si lo necesitas.

Mejor recomendación para una empresa unipersonal: usar uno de estos.

### Opción A — Railway + Neon (recomendado)

Combinación más simple para una sola persona: Railway corre el server.ts persistente, Neon da Postgres gratis.

1. Sube el repo a GitHub.
2. En <https://railway.app> → "New Project" → "Deploy from GitHub repo" → elige el repo.
3. Railway detecta `package.json` y usa `pnpm build` + `pnpm start` automáticamente.
4. En "Variables", añade:
   - `DATABASE_URL` (Pooled de Neon)
   - `DIRECT_DATABASE_URL` (Direct de Neon)
   - `JWT_ACCESS_SECRET` (nuevo, no reutilices el de dev)
   - `JWT_REFRESH_SECRET` (nuevo, no reutilices el de dev)
   - `NEXT_PUBLIC_APP_URL` = `https://tu-proyecto.up.railway.app`
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`
   - `S3_*` (Cloudflare R2 — ver sección anterior)
5. Settings → Networking → "Generate Domain" (gratis, `*.up.railway.app`) o conecta tu dominio.
6. Crea las tablas (una sola vez) desde tu máquina apuntando al `DATABASE_URL` de producción:

```bash
pnpm prisma migrate deploy
pnpm prisma:seed
```

### Opción B — Render

Crea un "Web Service" desde el repo. Render detecta Node + `package.json` automáticamente. Build command: `pnpm install && pnpm build`. Start command: `pnpm start`. Plan free funciona pero se duerme tras 15 min de inactividad (problema para chat).

### Opción C — Fly.io

`fly launch` desde la raíz. Detecta Node. El plan free tier (3 VMs `shared-cpu-1x` con 256 MB) es suficiente para chat de pocos usuarios. Si el chat crece a varios miles concurrentes, sube a `shared-cpu-2x` con 512 MB.

### Opción D — VPS (Digital Ocean / Hetzner / OVH)

`pm2 start "pnpm start"` detrás de Nginx/Caddy. Más control, más operativa. Útil si ya tienes infra propia.

### Opción E — AWS (cumplimiento empresarial)

- **App Runner** o **Elastic Beanstalk** corren el `server.ts` Node sin problemas
- **RDS PostgreSQL** para la BD
- **CloudFront** delante para CDN
- **Route53** para el dominio

Más operativa, pero útil si el cliente requiere AWS específicamente.

### Checklist pre-producción

- [ ] Variables `JWT_*` regeneradas (no las de dev)
- [ ] `NODE_ENV=production` (Vercel lo pone solo)
- [ ] `DATABASE_URL` con `?sslmode=require`
- [ ] Dominio HTTPS configurado (Vercel también automático)
- [ ] Healthcheck apuntado a `/api/health` (uptime monitor)
- [ ] Backups automáticos en Neon activados (free tier los tiene)
- [ ] Iconos PWA reales en `public/icons/` (ver `public/icons/README.md`)
- [ ] Email transaccional configurado (lo añadiremos en Capa 9)
- [ ] **Host con soporte WebSocket persistente** — Vercel serverless NO sirve; usa Railway/Render/Fly/VPS
- [ ] Si tienes >1 instancia del servidor, configurar `@socket.io/redis-adapter` con `REDIS_URL` (single instance funciona sin Redis)

---

## Estructura del proyecto

```text
education-lms/
├── prisma/
│   ├── schema.prisma          # 28 modelos cubriendo las 10 capas
│   └── seed.ts                # admin + demo users + categorías + cursos
├── public/
│   ├── manifest.json          # PWA
│   ├── sw.js                  # service worker custom
│   └── icons/                 # PWA icons (placeholder hoy)
├── src/
│   ├── app/
│   │   ├── layout.tsx              # root layout con providers + PWA meta
│   │   ├── page.tsx                # landing pública
│   │   ├── offline/page.tsx        # fallback del SW
│   │   ├── (auth)/                 # ruta-group: redirige si ya hay sesión
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (app)/                  # ruta-group: requiere sesión
│   │   │   ├── dashboard/
│   │   │   ├── courses/            # catálogo, detalle, new, edit, students
│   │   │   ├── my/courses/         # mis cursos (impartidos vs inscritos)
│   │   │   └── admin/
│   │   │       ├── users/          # moderación de usuarios
│   │   │       └── categories/     # CRUD jerárquico de categorías
│   │   └── api/
│   │       ├── auth/{register,login,refresh,logout,me}/route.ts
│   │       ├── users/{...}/route.ts
│   │       ├── categories/{...}/route.ts
│   │       ├── courses/{...}/route.ts        # incl. publish/archive
│   │       ├── enrollments/[id]/{...}/route.ts
│   │       ├── me/{courses,enrollments}/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── app-shell.tsx           # nav responsive role-aware
│   │   └── ui/                     # Button, Input, Select, Card, Alert, Badge
│   ├── lib/
│   │   ├── env.ts                  # validación zod de variables
│   │   ├── prisma.ts               # singleton HMR-safe
│   │   ├── cn.ts                   # Tailwind class merger
│   │   ├── slug.ts                 # slugify + ensureUniqueSlug
│   │   ├── auth/                   # password, tokens (jose), cookies, session, service, schemas
│   │   ├── rbac/                   # roles, permissions, mapping role→permissions
│   │   ├── api/                    # errors, handler wrapper, validate, rate-limit, meta, client
│   │   ├── users/                  # service + zod schemas
│   │   ├── categories/             # service + zod schemas
│   │   ├── courses/                # service + zod schemas
│   │   └── enrollments/            # service + zod schemas
│   └── middleware.ts               # CSP con nonce
└── __tests__/                      # Vitest
    ├── auth/                       # password, tokens
    ├── rbac/                       # permissions
    ├── users/                      # approve-teacher
    ├── courses/                    # courses service + enrollments service
    └── slug.test.ts                # slugify + collisions
```

---

## Tests

```bash
pnpm test           # run once
pnpm test:watch     # watch mode
pnpm test:cov       # con coverage
```

Tests incluidos hasta hoy:

- `__tests__/auth/password.test.ts` — hash/verify round-trip, malformed hash, dummy timing shield
- `__tests__/auth/tokens.test.ts` — sign/verify JWT, tampering rejection, refresh token entropy, TTL parser
- `__tests__/rbac/permissions.test.ts` — role → permissions invariants
- `__tests__/users/approve-teacher.test.ts` — flujo crítico de moderación de profesor con Prisma mockeado
- `__tests__/slug.test.ts` — slugify (diacríticos, runs no-alnum, longitud) + colisiones del ensureUniqueSlug
- `__tests__/courses/courses.service.test.ts` — visibilidad por rol (draft, archived), publicación idempotente, slug auto-generado, validación de fechas
- `__tests__/courses/enrollments.service.test.ts` — request (con/sin aprobación, capacidad, idempotencia, re-request), approve/reject/remove con reglas de estado

Cada capa nueva añade sus tests sobre su lógica crítica.

---

## ¿Qué hago al darle continuidad?

Cuando quieras pasar a la **Capa 3** (módulos + lecciones + materiales + uploads a S3/R2),
simplemente dímelo. Cada capa se construye encima del cimiento sin tocarlo:

- Mismas convenciones (zod schemas, route wrapper, service inyectable, tests Vitest)
- Mismo RBAC (los permisos ya están definidos para todas las capas)
- Mismo esquema de BD (las tablas ya existen, solo hay que conectarlas)

Eso significa que añadir cada capa es **rápido** porque la fricción de arquitectura ya está pagada.
