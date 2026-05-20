import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LiveSessionStatus, Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    liveSession: { findMany: vi.fn().mockResolvedValue([]) },
    assignment: { findMany: vi.fn().mockResolvedValue([]) },
    course: { findMany: vi.fn().mockResolvedValue([]) },
    scheduleEvent: { findMany: vi.fn().mockResolvedValue([]) },
    parentChildLink: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  };
}

describe('CalendarService.eventsForUser', () => {
  it('returns LIVE sessions in red and SCHEDULED in blue, sorted by start', async () => {
    const m = buildMock();
    const now = new Date('2026-06-01T09:00:00Z');
    m.liveSession.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Class 1',
        scheduledStart: new Date('2026-06-01T10:00:00Z'),
        scheduledEnd: new Date('2026-06-01T11:00:00Z'),
        status: LiveSessionStatus.SCHEDULED,
        course: { id: 'c1', slug: 'algebra', title: 'Algebra 101' },
      },
      {
        id: 's2',
        title: 'Class 2 (now)',
        scheduledStart: new Date('2026-06-01T09:30:00Z'),
        scheduledEnd: new Date('2026-06-01T10:30:00Z'),
        status: LiveSessionStatus.LIVE,
        course: { id: 'c1', slug: 'algebra', title: 'Algebra 101' },
      },
    ]);
    const { CalendarService } = await import('@/lib/calendar/service');
    const svc = new CalendarService(m as never);
    const result = await svc.eventsForUser('stu_1', Role.STUDENT, {
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-06-02T00:00:00Z'),
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('LIVE_SESSION:s2'); // 09:30 first
    expect(result[0]!.color).toBe('#dc2626'); // LIVE red
    expect(result[1]!.id).toBe('LIVE_SESSION:s1');
    expect(result[1]!.color).toBe('#2563eb'); // SCHEDULED blue
    void now;
  });

  it('includes assignment due dates with proper href', async () => {
    const m = buildMock();
    m.assignment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'HW 1',
        dueAt: new Date('2026-06-10T23:59:00Z'),
        lessonId: 'l1',
        course: { slug: 'algebra', title: 'Algebra 101' },
      },
    ]);
    const { CalendarService } = await import('@/lib/calendar/service');
    const svc = new CalendarService(m as never);
    const result = await svc.eventsForUser('stu_1', Role.STUDENT, {
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-06-30T00:00:00Z'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe('ASSIGNMENT_DUE');
    expect(result[0]!.href).toBe('/courses/algebra/lessons/l1');
  });

  it('emits COURSE_START and COURSE_END as all-day events when within range', async () => {
    const m = buildMock();
    m.course.findMany.mockResolvedValue([
      {
        id: 'c1',
        slug: 'algebra',
        title: 'Algebra 101',
        startsAt: new Date('2026-06-01T00:00:00Z'),
        endsAt: new Date('2026-12-15T00:00:00Z'),
      },
    ]);
    const { CalendarService } = await import('@/lib/calendar/service');
    const svc = new CalendarService(m as never);
    const result = await svc.eventsForUser('stu_1', Role.STUDENT, {
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-06-30T00:00:00Z'),
    });
    // Only start in range; end is in December → only 1 event.
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe('COURSE_START');
    expect(result[0]!.allDay).toBe(true);
  });

  it('rejects an inverted range', async () => {
    const m = buildMock();
    const { CalendarService } = await import('@/lib/calendar/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CalendarService(m as never);
    await expect(
      svc.eventsForUser('u', Role.STUDENT, {
        from: new Date('2026-06-30'),
        to: new Date('2026-06-01'),
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects ranges > 6 months', async () => {
    const m = buildMock();
    const { CalendarService } = await import('@/lib/calendar/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CalendarService(m as never);
    await expect(
      svc.eventsForUser('u', Role.STUDENT, {
        from: new Date('2026-01-01'),
        to: new Date('2027-01-01'),
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('CalendarService.eventsForChild', () => {
  it('only PARENT or ADMIN can call this', async () => {
    const m = buildMock();
    const { CalendarService } = await import('@/lib/calendar/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CalendarService(m as never);
    await expect(
      svc.eventsForChild('stu_1', {}, { userId: 'tch', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('PARENT must have an APPROVED link', async () => {
    const m = buildMock();
    m.parentChildLink.findUnique.mockResolvedValue({ status: 'PENDING' });
    const { CalendarService } = await import('@/lib/calendar/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CalendarService(m as never);
    await expect(
      svc.eventsForChild('stu_1', {}, { userId: 'par', role: Role.PARENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('strips MANUAL events (parent should not see private notes)', async () => {
    const m = buildMock();
    m.parentChildLink.findUnique.mockResolvedValue({ status: 'APPROVED' });
    m.user.findUnique.mockResolvedValue({ fullName: 'Stu', role: Role.STUDENT });
    m.scheduleEvent.findMany.mockResolvedValue([
      {
        id: 'pe1',
        title: 'secret note',
        notes: null,
        startsAt: new Date('2026-06-15'),
        endsAt: new Date('2026-06-15'),
        allDay: true,
        color: null,
      },
    ]);
    m.liveSession.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Class',
        scheduledStart: new Date('2026-06-15T10:00Z'),
        scheduledEnd: new Date('2026-06-15T11:00Z'),
        status: LiveSessionStatus.SCHEDULED,
        course: { id: 'c1', slug: 'x', title: 'X' },
      },
    ]);
    const { CalendarService } = await import('@/lib/calendar/service');
    const svc = new CalendarService(m as never);
    const result = await svc.eventsForChild('stu_1', {}, { userId: 'par', role: Role.PARENT });
    expect(result.find((e) => e.kind === 'MANUAL')).toBeUndefined();
    expect(result.find((e) => e.kind === 'LIVE_SESSION')).toBeDefined();
    expect(result[0]!.ownerName).toBe('Stu');
  });
});
