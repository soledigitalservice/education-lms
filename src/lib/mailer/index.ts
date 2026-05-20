/**
 * Pluggable mailer. Routes call `getMailer().send({...})` and don't care
 * whether the actual delivery path is Resend, SES, SMTP or a console no-op.
 */
import { isEmailConfigured } from '../env';
import { NoopMailer } from './noop-mailer';
import { ResendMailer } from './resend-mailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback for clients that don't render HTML. */
  text?: string;
}

export interface Mailer {
  /**
   * Send one email. Implementations MUST NOT throw on transient delivery
   * failures (logged + return false instead) so notification dispatch
   * stays best-effort and never blocks the calling transaction.
   */
  send(message: MailMessage): Promise<boolean>;
}

let cached: Mailer | null = null;

export function getMailer(): Mailer {
  if (cached) return cached;
  cached = isEmailConfigured() ? new ResendMailer() : new NoopMailer();
  return cached;
}

/** Test helper. */
export function _resetMailerForTests(): void {
  cached = null;
}

export type { MailerSend } from './templates';
export { renderTemplate } from './templates';
