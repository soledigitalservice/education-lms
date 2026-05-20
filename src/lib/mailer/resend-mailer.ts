/* eslint-disable no-console */
import { Resend } from 'resend';

import { env } from '../env';
import type { Mailer, MailMessage } from './index';

export class ResendMailer implements Mailer {
  private readonly client: Resend;
  private readonly from: string;

  constructor() {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      throw new Error('ResendMailer instantiated without RESEND_API_KEY/EMAIL_FROM');
    }
    this.client = new Resend(env.RESEND_API_KEY);
    this.from = env.EMAIL_FROM;
  }

  async send(message: MailMessage): Promise<boolean> {
    try {
      const { error } = await this.client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
      });
      if (error) {
        console.warn(`Resend rejected message to ${message.to}:`, error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`Resend threw while sending to ${message.to}:`, err);
      return false;
    }
  }
}
