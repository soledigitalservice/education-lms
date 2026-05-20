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
    course: { findFirst: vi.fn() },
    module: { findUnique: vi.fn(), findFirst: vi.fn() },
    lesson: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    enrollment: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)({});
      return ops;
    }),
  };
}

const teacherCourse = {
  id: 'crs_1',
  teacherId: 'tch_1',
  deletedAt: null,
};

describe('LessonsService.reorder', () => {
  it('swaps with previous sibling on direction=up', async () => {
    const m = buildMock();
    const lesson = { id: 'l2', moduleId: 'mod', position: 2 };
    const prev = { id: 'l1', position: 1 };
    m.lesson.findUnique.mockResolvedValue(lesson);
    m.module.findUnique.mockResolvedValue({
      id: 'mod',
      courseId: 'crs_1',
      course: teacherCourse,
    });
    m.lesson.findFirst.mockResolvedValue(prev);

    const { LessonsService } = await import('@/lib/lessons/service');
    const svc = new LessonsService(m as never);
    await svc.reorder('l2', { direction: 'up' }, { userId: 'tch_1', role: Role.TEACHER });

    expect(m.$transaction).toHaveBeenCalled();
    const updates = m.lesson.update.mock.calls.map((c) => c[0]);
    // 1. temp move of l2, 2. l1 → pos 2, 3. l2 → pos 1
    expect(updates[0]).toEqual({ where: { id: 'l2' }, data: { position: -3 } });
    expect(updates[1]).toEqual({ where: { id: 'l1' }, data: { position: 2 } });
    expect(updates[2]).toEqual({ where: { id: 'l2' }, data: { position: 1 } });
  });

  it('is a no-op at the edge (direction=up on first lesson)', async () => {
    const m = buildMock();
    m.lesson.findUnique.mockResolvedValue({ id: 'l1', moduleId: 'mod', position: 1 });
    m.module.findUnique.mockResolvedValue({
      id: 'mod',
      courseId: 'crs_1',
      course: teacherCourse,
    });
    m.lesson.findFirst.mockResolvedValue(null); // no previous sibling

    const { LessonsService } = await import('@/lib/lessons/service');
    const svc = new LessonsService(m as never);
    await svc.reorder('l1', { direction: 'up' }, { userId: 'tch_1', role: Role.TEACHER });

    expect(m.$transaction).not.toHaveBeenCalled();
    expect(m.lesson.update).not.toHaveBeenCalled();
  });

  it('forbids non-owner teachers', async () => {
    const m = buildMock();
    m.lesson.findUnique.mockResolvedValue({ id: 'l1', moduleId: 'mod', position: 1 });
    m.module.findUnique.mockResolvedValue({
      id: 'mod',
      courseId: 'crs_1',
      course: teacherCourse,
    });
    const { LessonsService } = await import('@/lib/lessons/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new LessonsService(m as never);
    await expect(
      svc.reorder('l1', { direction: 'up' }, { userId: 'other', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('LessonsService.create', () => {
  it('appends with position = max+1', async () => {
    const m = buildMock();
    m.module.findUnique.mockResolvedValue({
      id: 'mod',
      courseId: 'crs_1',
      course: teacherCourse,
    });
    m.lesson.findFirst.mockResolvedValue({ position: 3 });
    m.lesson.create.mockResolvedValue({
      id: 'l_new',
      moduleId: 'mod',
      title: 'New',
      content: null,
      type: 'CONTENT',
      durationMin: null,
      position: 4,
      publishedAt: null,
      _count: { materials: 0 },
    });

    const { LessonsService } = await import('@/lib/lessons/service');
    const svc = new LessonsService(m as never);
    const result = await svc.create(
      'mod',
      { title: 'New', type: 'CONTENT' },
      { userId: 'tch_1', role: Role.TEACHER },
    );

    expect(m.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 4, moduleId: 'mod' }),
      }),
    );
    expect(result.position).toBe(4);
  });
});

describe('LessonsService.listForModule', () => {
  it('hides unpublished lessons from non-managers', async () => {
    const m = buildMock();
    m.module.findUnique.mockResolvedValue({
      id: 'mod',
      courseId: 'crs_1',
      course: { ...teacherCourse },
    });
    m.enrollment.findFirst.mockResolvedValue({ id: 'enr_1' }); // student is enrolled
    m.lesson.findMany.mockResolvedValue([]);

    const { LessonsService } = await import('@/lib/lessons/service');
    const svc = new LessonsService(m as never);
    await svc.listForModule('mod', { userId: 'stu_1', role: Role.STUDENT });

    expect(m.lesson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ publishedAt: { not: null } }),
      }),
    );
  });

  it('shows everything (including drafts) to the teacher owner', async () => {
    const m = buildMock();
    m.module.findUnique.mockResolvedValue({
      id: 'mod',
      courseId: 'crs_1',
      course: teacherCourse,
    });
    m.lesson.findMany.mockResolvedValue([]);

    const { LessonsService } = await import('@/lib/lessons/service');
    const svc = new LessonsService(m as never);
    await svc.listForModule('mod', { userId: 'tch_1', role: Role.TEACHER });

    // No publishedAt filter when caller is owner.
    const where = m.lesson.findMany.mock.calls[0]![0].where;
    expect(where).toEqual({ moduleId: 'mod' });
  });
});
