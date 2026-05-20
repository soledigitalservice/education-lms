import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

interface PrismaMock {
  course: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  courseCategory: { findUnique: ReturnType<typeof vi.fn> };
  enrollment: { findFirst: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
}

function buildPrismaMock(): PrismaMock {
  return {
    course: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    courseCategory: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)({});
      return ops;
    }),
  };
}

const baseCourse = {
  id: 'crs_1',
  title: 'Algebra',
  slug: 'algebra',
  summary: null,
  description: null,
  coverImageUrl: null,
  language: 'es',
  teacherId: 'tch_1',
  categoryId: null,
  requiresApproval: true,
  maxStudents: null,
  startsAt: null,
  endsAt: null,
  publishedAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const fullInclude = {
  ...baseCourse,
  teacher: { id: 'tch_1', fullName: 'Ana', avatarUrl: null },
  category: null,
  _count: { enrollments: 0 },
};

describe('CoursesService.create', () => {
  it('rejects non-teacher non-admin roles', async () => {
    const mock = buildPrismaMock();
    const { CoursesService } = await import('@/lib/courses/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CoursesService(mock as never);
    await expect(
      svc.create({ title: 'X', language: 'es', requiresApproval: true }, { userId: 'u', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects when endsAt < startsAt', async () => {
    const mock = buildPrismaMock();
    const { CoursesService } = await import('@/lib/courses/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CoursesService(mock as never);
    await expect(
      svc.create(
        {
          title: 'X',
          language: 'es',
          requiresApproval: true,
          startsAt: new Date('2026-03-01'),
          endsAt: new Date('2026-01-01'),
        },
        { userId: 'tch_1', role: Role.TEACHER },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('auto-generates a unique slug from the title', async () => {
    const mock = buildPrismaMock();
    // First slug "algebra-101" is taken, "algebra-101-2" is free.
    mock.course.count
      .mockResolvedValueOnce(1) // base taken
      .mockResolvedValueOnce(0); // base-2 free
    mock.course.create.mockResolvedValue(fullInclude);
    const { CoursesService } = await import('@/lib/courses/service');
    const svc = new CoursesService(mock as never);
    await svc.create(
      { title: 'Algebra 101', language: 'es', requiresApproval: true },
      { userId: 'tch_1', role: Role.TEACHER },
    );
    expect(mock.course.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'algebra-101-2', teacherId: 'tch_1' }),
      }),
    );
  });
});

describe('CoursesService.publish (idempotency)', () => {
  it('does not overwrite publishedAt when already published', async () => {
    const mock = buildPrismaMock();
    const published = { ...baseCourse, publishedAt: new Date('2026-02-01') };
    mock.course.findFirst.mockResolvedValue(published);
    mock.course.findUnique.mockResolvedValue({
      ...fullInclude,
      publishedAt: new Date('2026-02-01'),
    });
    const { CoursesService } = await import('@/lib/courses/service');
    const svc = new CoursesService(mock as never);
    const result = await svc.publish('crs_1', { userId: 'tch_1', role: Role.TEACHER });
    expect(mock.course.update).not.toHaveBeenCalled();
    expect(result.publishedAt).toBe(new Date('2026-02-01').toISOString());
  });

  it('forbids non-owners from publishing', async () => {
    const mock = buildPrismaMock();
    mock.course.findFirst.mockResolvedValue(baseCourse);
    const { CoursesService } = await import('@/lib/courses/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CoursesService(mock as never);
    await expect(
      svc.publish('crs_1', { userId: 'other', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('CoursesService.getByIdOrSlug (visibility)', () => {
  it('hides drafts from non-owners', async () => {
    const mock = buildPrismaMock();
    mock.course.findFirst.mockResolvedValue({ ...fullInclude, publishedAt: null });
    const { CoursesService } = await import('@/lib/courses/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CoursesService(mock as never);
    await expect(
      svc.getByIdOrSlug('algebra', { userId: 'other_student', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('shows drafts to the teacher owner', async () => {
    const mock = buildPrismaMock();
    mock.course.findFirst.mockResolvedValue({ ...fullInclude, publishedAt: null });
    const { CoursesService } = await import('@/lib/courses/service');
    const svc = new CoursesService(mock as never);
    const result = await svc.getByIdOrSlug('algebra', { userId: 'tch_1', role: Role.TEACHER });
    expect(result.id).toBe('crs_1');
    expect(result.publishedAt).toBeNull();
  });

  it('shows archived courses to enrolled students', async () => {
    const mock = buildPrismaMock();
    mock.course.findFirst.mockResolvedValue({
      ...fullInclude,
      publishedAt: new Date('2026-01-01'),
      archivedAt: new Date('2026-04-01'),
    });
    mock.enrollment.findFirst.mockResolvedValue({ id: 'enr_1' });
    const { CoursesService } = await import('@/lib/courses/service');
    const svc = new CoursesService(mock as never);
    const result = await svc.getByIdOrSlug('algebra', {
      userId: 'student_enrolled',
      role: Role.STUDENT,
    });
    expect(result.archivedAt).not.toBeNull();
  });

  it('hides archived courses from non-enrolled students', async () => {
    const mock = buildPrismaMock();
    mock.course.findFirst.mockResolvedValue({
      ...fullInclude,
      publishedAt: new Date('2026-01-01'),
      archivedAt: new Date('2026-04-01'),
    });
    mock.enrollment.findFirst.mockResolvedValue(null);
    const { CoursesService } = await import('@/lib/courses/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new CoursesService(mock as never);
    await expect(
      svc.getByIdOrSlug('algebra', { userId: 'random_student', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
