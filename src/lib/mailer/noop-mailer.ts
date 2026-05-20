/* eslint-disable no-console */
import type { Mailer, MailMessage } from './index';

/**
 * Dev/test backend: logs to console so engineers can copy-paste a magic
 * link from the terminal without having to set up Resend during local dev.
 * Always returns true so notification dispatch can continue.
 */
export class NoopMailer implements Mailer {
  async send(message: MailMessage): Promise<boolean> {
    console.log('\n📬 [NoopMailer] ' + '─'.repeat(60));
    console.log(`   To:      ${message.to}`);
    console.log(`   Subject: ${message.subject}`);
    if (message.text) console.log(`   ${message.text.split('\n').join('\n   ')}`);
    console.log('─'.repeat(72));
    return true;
  }
}
