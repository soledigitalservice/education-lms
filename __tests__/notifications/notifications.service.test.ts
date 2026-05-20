import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NotificationKind, Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
  // Email + push intentionally OFF so dispatch only writes the in-app row.
});

function buildMock() {
  return {
    user: { findUnique: vi.fn() },
    notification: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    pushSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    // Capa 11: dispatch loads preferences in a single findMany at start.
    // Empty array = "no overrides; apply defaults (all enabled)".
    notificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

const activeUser = {
  id: 'usr_1',
  fullName: 'Demo User',
  email: 'demo@example.com',
  status: 'ACTIVE',
  deletedAt: null,
};

describe('NotificationsService.dispatch', () => {
  it('creates an in-app Notification when channels default', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(activeUser);
    m.notification.create.mockResolvedValue({
      id: 'n1',
      kind: NotificationKind.ENROLLMENT_APPROVED,
      title: 'X',
      body: 'Y',
      link: null,
      data: {},
      readAt: null,
      createdAt: new Date(),
    });

    const { NotificationsService } = await import('@/lib/notifications/service');
    const svc = new NotificationsService(m as never);
    const result = await svc.dispatch({
      userId: 'usr_1',
      kind: NotificationKind.ENROLLMENT_APPROVED,
      title: 'X',
      body: 'Y',
    });
    expect(result?.id).toBe('n1');
    expect(m.notification.create).toHaveBeenCalled();
  });

  it('returns null and skips creation when the user is suspended', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue({ ...activeUser, status: 'SUSPENDED' });
    const { NotificationsService } = await import('@/lib/notifications/service');
    const svc = new NotificationsService(m as never);
    const result = await svc.dispatch({
      userId: 'usr_1',
      kind: NotificationKind.ENROLLMENT_APPROVED,
      title: 'X',
      body: 'Y',
    });
    expect(result).toBeNull();
    expect(m.notification.create).not.toHaveBeenCalled();
  });

  it('dedup skips create when an existing row with same dedupKey is found', async () => {
    const m = buildMock();
    m.notification.findFirst.mockResolvedValue({ id: 'existing' });
    const { NotificationsService } = await import('@/lib/notifications/service');
    const svc = new NotificationsService(m as never);
    const result = await svc.dispatch({
      userId: 'usr_1',
      kind: NotificationKind.ASSIGNMENT_DUE_SOON,
      title: 'X',
      body: 'Y',
      dedupKey: 'assignment_due_soon:abc',
    });
    expect(result).toBeNull();
    expect(m.notification.create).not.toHaveBeenCalled();
  });

  it('NEVER throws even if Prisma throws (dispatch is best-effort)', async () => {
    const m = buildMock();
    m.user.findUnique.mockRejectedValue(new Error('db down'));
    const { NotificationsService } = await import('@/lib/notifications/service');
    const svc = new NotificationsService(m as never);
    const result = await svc.dispatch({
      userId: 'usr_1',
      kind: NotificationKind.ENROLLMENT_APPROVED,
      title: 'X',
      body: 'Y',
    });
    expect(result).toBeNull();
  });

  // Capa 11: dispatch respects per-user NotificationPreference rows.
  it('skips in-app channel when preference row disables it (theoretical) — but INAPP is locked-on so always allowed', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(activeUser);
    // Even a row that says "INAPP disabled" must not suppress the in-app write,
    // because INAPP is short-circuited as always-allowed.
    const { NotificationChannel } = await import('@prisma/client');
    m.notificationPreference.findMany.mockResolvedValue([
      { kind: NotificationKind.ENROLLMENT_APPROVED, channel: NotificationChannel.INAPP, enabled: false },
    ]);
    m.notification.create.mockResolvedValue({
      id: 'n1',
      kind: NotificationKind.ENROLLMENT_APPROVED,
      title: 'X',
      body: 'Y',
      link: null,
      data: {},
      readAt: null,
      createdAt: new Date(),
    });

    const { NotificationsService } = await import('@/lib/notifications/service');
    const svc = new NotificationsService(m as never);
    const result = await svc.dispatch({
      userId: 'usr_1',
      kind: NotificationKind.ENROLLMENT_APPROVED,
      title: 'X',
      body: 'Y',
    });
    expect(result).not.toBeNull();
    expect(m.notification.create).toHaveBeenCalled();
  });
});

describe('NotificationsService.markRead', () => {
  it('forbids reading another user’s notification', async () => {
    const m = buildMock();
    m.notification.findUnique.mockResolvedValue({ userId: 'someone_else', readAt: null });
    const { NotificationsService } = await import('@/lib/notifications/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new NotificationsService(m as never);
    await expect(svc.markRead('n1', 'usr_1', Role.STUDENT)).rejects.toBeInstanceOf(ApiError);
  });

  it('admin can mark anyone’s notification as read', async () => {
    const m = buildMock();
    m.notification.findUnique.mockResolvedValue({ userId: 'someone_else', readAt: null });
    const { NotificationsService } = await import('@/lib/notifications/service');
    const svc = new NotificationsService(m as never);
    await expect(svc.markRead('n1', 'adm', Role.ADMIN)).resolves.toBeUndefined();
    expect(m.notification.update).toHaveBeenCalled();
  });

  it('idempotent when already read', async () => {
    const m = buildMock();
    m.notification.findUnique.mockResolvedValue({ userId: 'usr_1', readAt: new Date() });
    const { NotificationsService } = await import('@/lib/notifications/service');
    const svc = new NotificationsService(m as never);
    await svc.markRead('n1', 'usr_1', Role.STUDENT);
    expect(m.notification.update).not.toHaveBeenCalled();
  });
});
