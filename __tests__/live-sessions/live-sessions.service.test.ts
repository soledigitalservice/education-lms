import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LiveSessionStatus, Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
  // LiveKit configured (with a fake URL/key/secret) so the joinToken path runs.
  process.env.LIVEKIT_URL = 'wss://fake.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'APIKey_test';
  process.env.LIVEKIT_API_SECRET = 'secret-12345678901234567890123456789012';
});

function buildMock() {
  return {
    course: { findFirst: vi.fn() },
    lesson: { findUnique: vi.fn() },
    liveSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    enrollment: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)({});
      return ops;
    }),
  };
}

const courseRow = { id: 'crs', teacherId: 'tch', deletedAt: null };

const baseSession = {
  id: 'sess_1',
  courseId: 'crs',
  lessonId: null,
  hostId: 'tch',
  title: 'Class 1',
  description: null,
  roomName: 'crs-room',
  roomActive: false,
  status: LiveSessionStatus.SCHEDULED,
  scheduledStart: new Date('2026-06-01T10:00:00Z'),
  scheduledEnd: new Date('2026-06-01T11:00:00Z'),
  actualStart: null,
  actualEnd: null,
  allowChat: true,
  allowScreenShare: true,
  recordOnStart: false,
  course: courseRow,
  host: { id: 'tch', fullName: 'Teacher' },
  _count: { recordings: 0 },
};

describe('LiveSessionsService.create', () => {
  it('rejects when scheduledEnd <= scheduledStart', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue(courseRow);
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LiveSessionsService(m as never);
    await expect(
      svc.create(
        'crs',
        {
          title: 'Bad',
          scheduledStart: new Date('2026-06-01T11:00:00Z'),
          scheduledEnd: new Date('2026-06-01T10:00:00Z'),
          allowChat: true,
          allowScreenShare: true,
          recordOnStart: false,
        },
        { userId: 'tch', role: Role.TEACHER },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects non-owner teachers', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue(courseRow);
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LiveSessionsService(m as never);
    await expect(
      svc.create(
        'crs',
        {
          title: 'X',
          scheduledStart: new Date('2026-06-01T10:00:00Z'),
          scheduledEnd: new Date('2026-06-01T11:00:00Z'),
          allowChat: true,
          allowScreenShare: true,
          recordOnStart: false,
        },
        { userId: 'other_tch', role: Role.TEACHER },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('LiveSessionsService state machine', () => {
  it('markStarted is idempotent for LIVE', async () => {
    const m = buildMock();
    m.liveSession.findUnique.mockResolvedValue({ ...baseSession, status: LiveSessionStatus.LIVE });
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const svc = new LiveSessionsService(m as never);
    const out = await svc.markStarted('sess_1', { userId: 'tch', role: Role.TEACHER });
    expect(out.status).toBe(LiveSessionStatus.LIVE);
    expect(m.liveSession.update).not.toHaveBeenCalled();
  });

  it('markStarted rejects from ENDED', async () => {
    const m = buildMock();
    m.liveSession.findUnique.mockResolvedValue({ ...baseSession, status: LiveSessionStatus.ENDED });
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LiveSessionsService(m as never);
    await expect(
      svc.markStarted('sess_1', { userId: 'tch', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('only the host (or admin) can start', async () => {
    const m = buildMock();
    m.liveSession.findUnique.mockResolvedValue(baseSession);
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LiveSessionsService(m as never);
    await expect(
      svc.markStarted('sess_1', { userId: 'someone_else', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('cancel rejects when session has already ENDED', async () => {
    const m = buildMock();
    m.liveSession.findUnique.mockResolvedValue({ ...baseSession, status: LiveSessionStatus.ENDED });
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LiveSessionsService(m as never);
    await expect(
      svc.cancel('sess_1', { userId: 'tch', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('remove rejects when session is LIVE', async () => {
    const m = buildMock();
    m.liveSession.findUnique.mockResolvedValue({ ...baseSession, status: LiveSessionStatus.LIVE });
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LiveSessionsService(m as never);
    await expect(
      svc.remove('sess_1', { userId: 'tch', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('LiveSessionsService.joinToken', () => {
  it('rejects when session ended/cancelled', async () => {
    const m = buildMock();
    m.liveSession.findUnique.mockResolvedValue({ ...baseSession, status: LiveSessionStatus.ENDED });
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LiveSessionsService(m as never);
    await expect(
      svc.joinToken('sess_1', { userId: 'tch', role: Role.TEACHER }, 'Teacher'),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('students must be enrolled to receive a token', async () => {
    const m = buildMock();
    m.liveSession.findUnique.mockResolvedValue({ ...baseSession, status: LiveSessionStatus.LIVE });
    m.enrollment.findFirst.mockResolvedValue(null);
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LiveSessionsService(m as never);
    await expect(
      svc.joinToken('sess_1', { userId: 'stu_x', role: Role.STUDENT }, 'Stu'),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('returns a token + url + isHost=true for the host', async () => {
    const m = buildMock();
    m.liveSession.findUnique.mockResolvedValue({ ...baseSession, status: LiveSessionStatus.LIVE });
    const { LiveSessionsService } = await import('@/lib/live-sessions/service');
    const svc = new LiveSessionsService(m as never);
    const out = await svc.joinToken('sess_1', { userId: 'tch', role: Role.TEACHER }, 'Teacher');
    expect(out.isHost).toBe(true);
    expect(out.url).toMatch(/^wss?:\/\//);
    expect(out.token.split('.').length).toBe(3); // JWT triple
  });
});
