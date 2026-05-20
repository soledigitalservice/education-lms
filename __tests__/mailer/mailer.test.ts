import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  // Reset module cache so getMailer() recomputes per test.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

describe('getMailer adapter selection', () => {
  it('returns NoopMailer when email is NOT configured', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const mod = await import('@/lib/mailer');
    mod._resetMailerForTests();
    const { NoopMailer } = await import('@/lib/mailer/noop-mailer');
    const mailer = mod.getMailer();
    expect(mailer).toBeInstanceOf(NoopMailer);
    // NoopMailer always returns true and never throws.
    await expect(
      mailer.send({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' }),
    ).resolves.toBe(true);
  });

  it('returns ResendMailer when both vars are set', async () => {
    process.env.RESEND_API_KEY = 're_test_dummy';
    process.env.EMAIL_FROM = 'Education <no-reply@example.com>';
    const mod = await import('@/lib/mailer');
    mod._resetMailerForTests();
    const { ResendMailer } = await import('@/lib/mailer/resend-mailer');
    const mailer = mod.getMailer();
    expect(mailer).toBeInstanceOf(ResendMailer);
  });
});

describe('renderTemplate', () => {
  it('builds subject + html + text for each NotificationKind without throwing', async () => {
    const { renderTemplate } = await import('@/lib/mailer/templates');
    const { NotificationKind } = await import('@prisma/client');
    for (const kind of Object.values(NotificationKind)) {
      const out = renderTemplate(kind, {
        recipientName: 'Test',
        title: 'A title',
        body: 'A body line\nWith newlines.',
        link: '/some/path',
      });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html).toContain('Test');
      expect(out.html).toContain('A body line');
      expect(out.text).toContain('A body line');
      // Link must be absolute (prefixed with NEXT_PUBLIC_APP_URL).
      expect(out.html).toContain('/some/path');
    }
  });

  it('escapes HTML in user-supplied content', async () => {
    const { renderTemplate } = await import('@/lib/mailer/templates');
    const { NotificationKind } = await import('@prisma/client');
    const out = renderTemplate(NotificationKind.CHAT_MESSAGE, {
      recipientName: '<script>alert(1)</script>',
      title: 'X',
      body: 'hi <img src=x>',
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).not.toContain('<img src=x>');
  });
});
