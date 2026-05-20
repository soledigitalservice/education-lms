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
    user: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn() },
    parentChildLink: { findMany: vi.fn() },
    teacherReview: {
      upsert: vi.fn(),
      aggregate: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    teacherProfile: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
}

const teacher = { id: 'tch', role: Role.TEACHER, deletedAt: null };

describe('TeacherReviewsService.upsert', () => {
  it('rejects self-review', async () => {
    const m = buildMock();
    const { TeacherReviewsService } = await import('@/lib/teacher-reviews/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new TeacherReviewsService(m as never);
    await expect(
      svc.upsert('me', { rating: 5 }, { userId: 'me', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects ADMIN reviewing a teacher', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(teacher);
    const { TeacherReviewsService } = await import('@/lib/teacher-reviews/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new TeacherReviewsService(m as never);
    await expect(
      svc.upsert('tch', { rating: 5 }, { userId: 'adm', role: Role.ADMIN }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects student who was never enrolled with this teacher', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(teacher);
    m.enrollment.findFirst.mockResolvedValue(null);
    const { TeacherReviewsService } = await import('@/lib/teacher-reviews/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new TeacherReviewsService(m as never);
    await expect(
      svc.upsert('tch', { rating: 5 }, { userId: 'stu', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('parent can review only when they have a linked child enrolled in the teacher’s course', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(teacher);
    m.parentChildLink.findMany.mockResolvedValue([]); // no linked children
    const { TeacherReviewsService } = await import('@/lib/teacher-reviews/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new TeacherReviewsService(m as never);
    await expect(
      svc.upsert('tch', { rating: 4 }, { userId: 'par', role: Role.PARENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('refreshes denormalized rating after upsert', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(teacher);
    m.enrollment.findFirst.mockResolvedValue({ id: 'enr_1' });
    m.teacherReview.upsert.mockResolvedValue({
      id: 'rev_1',
      teacherId: 'tch',
      authorId: 'stu',
      courseId: null,
      rating: 5,
      comment: 'Great',
      createdAt: new Date(),
      updatedAt: new Date(),
      author: { id: 'stu', fullName: 'Stu' },
      course: null,
    });
    m.teacherReview.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: { _all: 2 } });

    const { TeacherReviewsService } = await import('@/lib/teacher-reviews/service');
    const svc = new TeacherReviewsService(m as never);
    await svc.upsert(
      'tch',
      { rating: 5, comment: 'Great' },
      { userId: 'stu', role: Role.STUDENT },
    );
    expect(m.teacherProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'tch' },
        update: expect.objectContaining({ ratingAvg: 4.5, ratingCount: 2 }),
      }),
    );
  });
});
