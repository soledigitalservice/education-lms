import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EnrollmentStatus, Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    course: { findFirst: vi.fn(), findUnique: vi.fn() },
    enrollment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)({});
      return ops;
    }),
  };
}

const publishedCourse = {
  id: 'crs_1',
  teacherId: 'tch_1',
  publishedAt: new Date(),
  archivedAt: null,
  deletedAt: null,
  requiresApproval: true,
  maxStudents: null,
};

describe('EnrollmentsService.request', () => {
  it('only students can request', async () => {
    const m = buildMock();
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new EnrollmentsService(m as never);
    await expect(
      svc.request('crs_1', { userId: 'tch_1', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects request on unpublished course', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue({ ...publishedCourse, publishedAt: null });
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new EnrollmentsService(m as never);
    await expect(
      svc.request('crs_1', { userId: 'stu_1', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('creates PENDING when requiresApproval=true', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue(publishedCourse);
    m.enrollment.findUnique.mockResolvedValue(null);
    m.enrollment.create.mockResolvedValue({ id: 'enr_1' });
    m.enrollment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'enr_1',
      courseId: 'crs_1',
      status: 'PENDING',
      requestedAt: new Date(),
      decidedAt: null,
      removedAt: null,
      reason: null,
      course: { id: 'crs_1', title: 'X', slug: 'x', coverImageUrl: null, teacher: { id: 'tch_1', fullName: 'Ana' } },
      student: { id: 'stu_1', fullName: 'Stu', email: 's@a.com', avatarUrl: null },
    });

    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const svc = new EnrollmentsService(m as never);
    const result = await svc.request('crs_1', { userId: 'stu_1', role: Role.STUDENT });
    expect(result.status).toBe('PENDING');
    expect(m.enrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: EnrollmentStatus.PENDING }),
      }),
    );
  });

  it('creates ACTIVE when requiresApproval=false', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue({ ...publishedCourse, requiresApproval: false });
    m.enrollment.findUnique
      .mockResolvedValueOnce(null) // initial lookup
      .mockResolvedValueOnce({
        id: 'enr_1',
        courseId: 'crs_1',
        status: 'ACTIVE',
        requestedAt: new Date(),
        decidedAt: new Date(),
        removedAt: null,
        reason: null,
        course: { id: 'crs_1', title: 'X', slug: 'x', coverImageUrl: null, teacher: { id: 'tch_1', fullName: 'Ana' } },
        student: { id: 'stu_1', fullName: 'Stu', email: 's@a.com', avatarUrl: null },
      });
    m.enrollment.create.mockResolvedValue({ id: 'enr_1' });
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const svc = new EnrollmentsService(m as never);
    const result = await svc.request('crs_1', { userId: 'stu_1', role: Role.STUDENT });
    expect(result.status).toBe('ACTIVE');
  });

  it('rejects when course is at capacity', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue({ ...publishedCourse, maxStudents: 10 });
    m.enrollment.findUnique.mockResolvedValue(null);
    m.enrollment.count.mockResolvedValue(10);
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new EnrollmentsService(m as never);
    await expect(
      svc.request('crs_1', { userId: 'stu_1', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('is idempotent for PENDING re-requests', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue(publishedCourse);
    m.enrollment.findUnique
      .mockResolvedValueOnce({ id: 'enr_1', status: EnrollmentStatus.PENDING })
      .mockResolvedValueOnce({
        id: 'enr_1',
        courseId: 'crs_1',
        status: 'PENDING',
        requestedAt: new Date(),
        decidedAt: null,
        removedAt: null,
        reason: null,
        course: { id: 'crs_1', title: 'X', slug: 'x', coverImageUrl: null, teacher: { id: 'tch_1', fullName: 'A' } },
        student: { id: 'stu_1', fullName: 'S', email: 's@x', avatarUrl: null },
      });
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const svc = new EnrollmentsService(m as never);
    const result = await svc.request('crs_1', { userId: 'stu_1', role: Role.STUDENT });
    expect(result.status).toBe('PENDING');
    expect(m.enrollment.create).not.toHaveBeenCalled();
  });
});

describe('EnrollmentsService.approve', () => {
  it('approves a PENDING enrollment', async () => {
    const m = buildMock();
    m.enrollment.findUnique
      .mockResolvedValueOnce({
        id: 'enr_1',
        courseId: 'crs_1',
        status: EnrollmentStatus.PENDING,
        course: { ...publishedCourse, deletedAt: null },
      })
      .mockResolvedValueOnce({
        id: 'enr_1',
        courseId: 'crs_1',
        status: 'ACTIVE',
        requestedAt: new Date(),
        decidedAt: new Date(),
        removedAt: null,
        reason: null,
        course: { id: 'crs_1', title: 'X', slug: 'x', coverImageUrl: null, teacher: { id: 'tch_1', fullName: 'A' } },
        student: { id: 'stu_1', fullName: 'S', email: 's@x', avatarUrl: null },
      });
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const svc = new EnrollmentsService(m as never);
    const result = await svc.approve('enr_1', { userId: 'tch_1', role: Role.TEACHER });
    expect(result.status).toBe('ACTIVE');
  });

  it('forbids non-owner teachers', async () => {
    const m = buildMock();
    m.enrollment.findUnique.mockResolvedValue({
      id: 'enr_1',
      courseId: 'crs_1',
      status: EnrollmentStatus.PENDING,
      course: { ...publishedCourse, teacherId: 'tch_1', deletedAt: null },
    });
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new EnrollmentsService(m as never);
    await expect(
      svc.approve('enr_1', { userId: 'other_teacher', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects approve on a non-PENDING enrollment', async () => {
    const m = buildMock();
    m.enrollment.findUnique.mockResolvedValue({
      id: 'enr_1',
      courseId: 'crs_1',
      status: EnrollmentStatus.REMOVED,
      course: { ...publishedCourse, deletedAt: null },
    });
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new EnrollmentsService(m as never);
    await expect(
      svc.approve('enr_1', { userId: 'tch_1', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('blocks approve when capacity is full', async () => {
    const m = buildMock();
    m.enrollment.findUnique.mockResolvedValue({
      id: 'enr_1',
      courseId: 'crs_1',
      status: EnrollmentStatus.PENDING,
      course: { ...publishedCourse, maxStudents: 5, deletedAt: null },
    });
    m.enrollment.count.mockResolvedValue(5);
    const { EnrollmentsService } = await import('@/lib/enrollments/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new EnrollmentsService(m as never);
    await expect(
      svc.approve('enr_1', { userId: 'tch_1', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
