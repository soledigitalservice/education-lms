import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NotificationChannel, NotificationKind } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    notificationPreference: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    }),
  };
}

describe('NotificationPreferencesService.listForUser', () => {
  it('returns full matrix with defaults when user has no rows', async () => {
    const m = buildMock();
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const svc = new NotificationPreferencesService(m as never);
    const matrix = await svc.listForUser('u1');
    // 14 kinds × 3 channels = 42 rows in the matrix.
    expect(matrix.length).toBe(Object.values(NotificationKind).length * 3);
    // Every cell should be a default (no DB rows).
    expect(matrix.every((c) => c.isDefault)).toBe(true);
    // INAPP rows must be locked AND enabled.
    const inappRows = matrix.filter((c) => c.channel === NotificationChannel.INAPP);
    expect(inappRows.every((c) => c.locked)).toBe(true);
    expect(inappRows.every((c) => c.enabled)).toBe(true);
    // EMAIL + PUSH default to enabled per the service defaults.
    const others = matrix.filter((c) => c.channel !== NotificationChannel.INAPP);
    expect(others.every((c) => c.enabled)).toBe(true);
  });

  it('overrides defaults with stored rows', async () => {
    const m = buildMock();
    m.notificationPreference.findMany.mockResolvedValue([
      {
        kind: NotificationKind.CHAT_MESSAGE,
        channel: NotificationChannel.EMAIL,
        enabled: false,
      },
    ]);
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const svc = new NotificationPreferencesService(m as never);
    const matrix = await svc.listForUser('u1');
    const chatEmail = matrix.find(
      (c) =>
        c.kind === NotificationKind.CHAT_MESSAGE && c.channel === NotificationChannel.EMAIL,
    );
    expect(chatEmail).toBeDefined();
    expect(chatEmail?.enabled).toBe(false);
    expect(chatEmail?.isDefault).toBe(false);
    expect(chatEmail?.locked).toBe(false);
  });
});

describe('NotificationPreferencesService.isAllowed', () => {
  it('always returns true for INAPP regardless of stored row', async () => {
    const m = buildMock();
    // Even if a malicious row tries to disable INAPP, the short-circuit wins.
    m.notificationPreference.findUnique.mockResolvedValue({ enabled: false });
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const svc = new NotificationPreferencesService(m as never);
    expect(
      await svc.isAllowed('u', NotificationKind.CHAT_MESSAGE, NotificationChannel.INAPP),
    ).toBe(true);
  });

  it('defaults to true when no row exists', async () => {
    const m = buildMock();
    m.notificationPreference.findUnique.mockResolvedValue(null);
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const svc = new NotificationPreferencesService(m as never);
    expect(
      await svc.isAllowed('u', NotificationKind.ASSIGNMENT_GRADED, NotificationChannel.EMAIL),
    ).toBe(true);
  });

  it('respects an explicit disable row', async () => {
    const m = buildMock();
    m.notificationPreference.findUnique.mockResolvedValue({ enabled: false });
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const svc = new NotificationPreferencesService(m as never);
    expect(
      await svc.isAllowed('u', NotificationKind.CHAT_MESSAGE, NotificationChannel.PUSH),
    ).toBe(false);
  });
});

describe('NotificationPreferencesService.loadGateForUser', () => {
  it('returns an in-memory function that short-circuits INAPP', async () => {
    const m = buildMock();
    m.notificationPreference.findMany.mockResolvedValue([]);
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const gate = await new NotificationPreferencesService(m as never).loadGateForUser('u');
    expect(gate(NotificationKind.CHAT_MESSAGE, NotificationChannel.INAPP)).toBe(true);
  });

  it('tolerates legacy mocks without notificationPreference (fail-open)', async () => {
    // Simulate a Prisma mock that doesn't include notificationPreference.
    const brokenMock = { notificationPreference: undefined } as never;
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const gate = await new NotificationPreferencesService(brokenMock).loadGateForUser('u');
    // Defaults still apply.
    expect(gate(NotificationKind.ASSIGNMENT_GRADED, NotificationChannel.EMAIL)).toBe(true);
  });
});

describe('NotificationPreferencesService.bulkUpsert', () => {
  it('rejects attempts to disable INAPP', async () => {
    const m = buildMock();
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new NotificationPreferencesService(m as never);
    await expect(
      svc.bulkUpsert('u', {
        preferences: [
          {
            kind: NotificationKind.CHAT_MESSAGE,
            channel: NotificationChannel.INAPP,
            enabled: false,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('no-ops on empty array', async () => {
    const m = buildMock();
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const svc = new NotificationPreferencesService(m as never);
    await svc.bulkUpsert('u', { preferences: [] });
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it('upserts each (kind, channel) in one transaction', async () => {
    const m = buildMock();
    const { NotificationPreferencesService } = await import(
      '@/lib/notification-preferences/service'
    );
    const svc = new NotificationPreferencesService(m as never);
    await svc.bulkUpsert('u', {
      preferences: [
        {
          kind: NotificationKind.CHAT_MESSAGE,
          channel: NotificationChannel.EMAIL,
          enabled: false,
        },
        {
          kind: NotificationKind.ASSIGNMENT_GRADED,
          channel: NotificationChannel.PUSH,
          enabled: false,
        },
      ],
    });
    expect(m.notificationPreference.upsert).toHaveBeenCalledTimes(2);
    expect(m.$transaction).toHaveBeenCalledTimes(1);
  });
});
