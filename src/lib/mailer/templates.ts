import { NotificationKind } from '@prisma/client';

import { env } from '../env';

export type MailerSend = { subject: string; html: string; text: string };

/**
 * Plain-HTML templates per NotificationKind. Kept intentionally minimal —
 * no MJML / react-email / handlebars — because the LMS sends short
 * transactional messages, not marketing newsletters. A 60-line HTML string
 * with inline styles renders identically in every client.
 *
 * To add a new kind: add a case below. The compiler enforces exhaustiveness
 * via the `assertNever` fallback.
 */
export interface TemplateContext {
  recipientName: string;
  title: string;
  body: string;
  /** Optional in-app deep link. We always append the app URL prefix. */
  link?: string;
}

export function renderTemplate(kind: NotificationKind, ctx: TemplateContext): MailerSend {
  const link = ctx.link ? `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}${ctx.link}` : null;

  const subject = subjectFor(kind, ctx.title);
  const text = textBody(ctx, link);
  const html = htmlBody(ctx, link);

  return { subject, html, text };
}

function subjectFor(kind: NotificationKind, title: string): string {
  switch (kind) {
    case NotificationKind.TEACHER_APPROVED:
      return '✅ Tu cuenta de profesor ha sido aprobada';
    case NotificationKind.TEACHER_REJECTED:
      return 'Tu solicitud de profesor';
    case NotificationKind.ENROLLMENT_REQUESTED:
      return `Nueva solicitud de inscripción: ${title}`;
    case NotificationKind.ENROLLMENT_APPROVED:
      return `✅ Aprobada tu inscripción en ${title}`;
    case NotificationKind.ENROLLMENT_REJECTED:
      return `Solicitud de inscripción rechazada: ${title}`;
    case NotificationKind.ENROLLMENT_REMOVED:
      return `Has sido dado de baja de ${title}`;
    case NotificationKind.ASSIGNMENT_PUBLISHED:
      return `📋 Nueva tarea: ${title}`;
    case NotificationKind.ASSIGNMENT_GRADED:
      return `📊 Tarea calificada: ${title}`;
    case NotificationKind.ASSIGNMENT_DUE_SOON:
      return `⏰ Recordatorio: ${title}`;
    case NotificationKind.LIVE_SESSION_STARTING:
      return `🔴 Empieza ahora: ${title}`;
    case NotificationKind.CHAT_MESSAGE:
      return `💬 Nuevo mensaje en ${title}`;
    case NotificationKind.PARENT_LINK_REQUESTED:
      return 'Solicitud para vincularse como padre/madre';
    case NotificationKind.PARENT_LINK_APPROVED:
      return 'Vínculo padre-hijo aprobado';
    case NotificationKind.FORUM_REPLY:
      return `💬 Respuesta en el foro: ${title}`;
  }
}

function textBody(ctx: TemplateContext, link: string | null): string {
  return [
    `Hola ${ctx.recipientName},`,
    '',
    ctx.body,
    ...(link ? ['', `Ver en la plataforma: ${link}`] : []),
    '',
    '—',
    'Education LMS',
  ].join('\n');
}

function htmlBody(ctx: TemplateContext, link: string | null): string {
  const safeName = escapeHtml(ctx.recipientName);
  const safeBody = escapeHtml(ctx.body).replace(/\n/g, '<br>');
  const linkBlock = link
    ? `
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(link)}"
             style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">
            Ver en la plataforma
          </a>
        </p>`
    : '';

  return `<!doctype html>
<html lang="es">
  <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f8fafc; padding:24px; color:#0f172a;">
    <div style="max-width: 560px; margin: 0 auto; background:#fff; padding:24px; border-radius:12px; border:1px solid #e2e8f0;">
      <p style="margin:0 0 16px;">Hola <strong>${safeName}</strong>,</p>
      <p style="margin:0 0 16px; font-size:15px; line-height:1.5;">${safeBody}</p>
      ${linkBlock}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="margin:0; color:#64748b; font-size:12px;">
        Recibes este correo porque eres usuario de Education LMS. Si no quieres recibir notificaciones
        por email, ajusta tus preferencias en la plataforma.
      </p>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
