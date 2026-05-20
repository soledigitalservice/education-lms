import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    course: { findUnique: vi.fn() },
    liveSession: { findUnique: vi.fn() },
    scheduleEvent: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)({});
      return ops;
    }),
  };
}

describe('ScheduleEventsService permissions', () => {
  it('non-owner non-admin cannot update', async () => {
    const m = buildMock();
    m.scheduleEvent.findUnique.mockResolvedValue({
      id: 'ev1',
      ownerId: 'usr_owner',
      title: 'X',
      notes: null,
      startsAt: new Date(),
      endsAt: new Date(),
      allDay: false,
      color: null,
    });
    const { ScheduleEventsService } = await import('@/lib/schedule-events/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ScheduleEventsService(m as never);
    await expect(
      svc.update('ev1', { title: 'pwn' }, { userId: 'someone', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('ADMIN can update any event', async () => {
    const m = buildMock();
    m.scheduleEvent.findUnique.mockResolvedValue({
      id: 'ev1',
      ownerId: 'usr_owner',
      title: 'X',
      notes: null,
      startsAt: new Date('2026-06-01'),
      endsAt: new Date('2026-06-01'),
      allDay: false,
      color: null,
    });
    m.scheduleEvent.update.mockResolvedValue({
      id: 'ev1',
      ownerId: 'usr_owner',
      title: 'X (renamed by admin)',
      notes: null,
      startsAt: new Date('2026-06-01'),
      endsAt: new Date('2026-06-01'),
      allDay: false,
      color: null,
      courseId: null,
      liveSessionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { ScheduleEventsService } = await import('@/lib/schedule-events/service');
    const svc = new ScheduleEventsService(m as never);
    const result = await svc.update(
      'ev1',
      { title: 'X (renamed by admin)' },
      { userId: 'adm', role: Role.ADMIN },
    );
    expect(result.title).toBe('X (renamed by admin)');
  });
});

describe('ScheduleEventsService.create', () => {
  it('rejects non-existent courseId', async () => {
    const m = buildMock();
    m.course.findUnique.mockResolvedValue(null);
    const { ScheduleEventsService } = await import('@/lib/schedule-events/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ScheduleEventsService(m as never);
    await expect(
      svc.create(
        {
          title: 'X',
          startsAt: new Date('2026-06-01'),
          endsAt: new Date('2026-06-02'),
          allDay: false,
          courseId: 'cm-fake',
        },
        { userId: 'u', role: Role.STUDENT },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects liveSessionId from another course when courseId is also provided', async () => {
    const m = buildMock();
    m.course.findUnique.mockResolvedValue({ id: 'c1', deletedAt: null });
    m.liveSession.findUnique.mockResolvedValue({ id: 's1', courseId: 'c_OTHER' });
    const { ScheduleEventsService } = await import('@/lib/schedule-events/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ScheduleEventsService(m as never);
    await expect(
      svc.create(
        {
          title: 'X',
          startsAt: new Date('2026-06-01'),
          endsAt: new Date('2026-06-02'),
          allDay: false,
          courseId: 'c1',
          liveSessionId: 's1',
        },
        { userId: 'u', role: Role.STUDENT },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('persists with default color null', async () => {
    const m = buildMock();
    m.scheduleEvent.create.mockResolvedValue({
      id: 'ev1',
      ownerId: 'u',
      title: 'X',
      notes: null,
      startsAt: new Date('2026-06-01'),
      endsAt: new Date('2026-06-02'),
      allDay: false,
      color: null,
      courseId: null,
      liveSessionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { ScheduleEventsService } = await import('@/lib/schedule-events/service');
    const svc = new ScheduleEventsService(m as never);
    const result = await svc.create(
      {
        title: 'X',
        startsAt: new Date('2026-06-01'),
        endsAt: new Date('2026-06-02'),
        allDay: false,
      },
      { userId: 'u', role: Role.STUDENT },
    );
    expect(result.color).toBeNull();
  });
});
