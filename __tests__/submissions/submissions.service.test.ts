import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Role, SubmissionStatus } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    assignment: { findUnique: vi.fn() },
    course: { findFirst: vi.fn() },
    enrollment: { findFirst: vi.fn() },
    submission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    submissionFile: { delete: vi.fn() },
    storedFile: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)({});
      return ops;
    }),
  };
}

const courseRow = { id: 'crs', teacherId: 'tch', deletedAt: null };
const assignmentRow = {
  id: 'asg',
  courseId: 'crs',
  dueAt: new Date('2026-06-01T12:00:00Z'),
  allowLate: true,
  maxScore: 100,
  publishedAt: new Date('2026-05-01'),
  course: courseRow,
};

describe('SubmissionsService.submit', () => {
  it('marks the submission as SUBMITTED when on time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-31T12:00:00Z'));

    const m = buildMock();
    m.submission.findUnique.mockResolvedValue({
      id: 'sub',
      status: SubmissionStatus.DRAFT,
      studentId: 'stu',
      notes: null,
      files: [{ id: 'sf1' }],
      assignment: assignmentRow,
    });
    m.submission.update.mockImplementation(async (args: { data: { status: string } }) => ({
      id: 'sub',
      assignmentId: 'asg',
      studentId: 'stu',
      student: { id: 'stu', fullName: 'S', email: 's@x', avatarUrl: null },
      status: args.data.status,
      notes: null,
      submittedAt: new Date(),
      files: [],
      grade: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignment: { dueAt: assignmentRow.dueAt, allowLate: true, maxScore: 100 },
    }));

    const { SubmissionsService } = await import('@/lib/submissions/service');
    const svc = new SubmissionsService(m as never);
    const result = await svc.submit('sub', {}, { userId: 'stu', role: Role.STUDENT });

    expect(result.status).toBe(SubmissionStatus.SUBMITTED);
    expect(m.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: SubmissionStatus.SUBMITTED }),
      }),
    );

    vi.useRealTimers();
  });

  it('marks the submission as LATE when past dueAt with allowLate=true', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T12:00:00Z')); // 1 day past dueAt

    const m = buildMock();
    m.submission.findUnique.mockResolvedValue({
      id: 'sub',
      status: SubmissionStatus.DRAFT,
      studentId: 'stu',
      notes: null,
      files: [{ id: 'sf1' }],
      assignment: assignmentRow,
    });
    m.submission.update.mockImplementation(async (args: { data: { status: string } }) => ({
      id: 'sub',
      assignmentId: 'asg',
      studentId: 'stu',
      student: { id: 'stu', fullName: 'S', email: 's@x', avatarUrl: null },
      status: args.data.status,
      notes: null,
      submittedAt: new Date(),
      files: [],
      grade: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignment: { dueAt: assignmentRow.dueAt, allowLate: true, maxScore: 100 },
    }));

    const { SubmissionsService } = await import('@/lib/submissions/service');
    const svc = new SubmissionsService(m as never);
    const result = await svc.submit('sub', {}, { userId: 'stu', role: Role.STUDENT });

    expect(result.status).toBe(SubmissionStatus.LATE);
    vi.useRealTimers();
  });

  it('rejects late submission when allowLate=false', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T12:00:00Z'));

    const m = buildMock();
    m.submission.findUnique.mockResolvedValue({
      id: 'sub',
      status: SubmissionStatus.DRAFT,
      studentId: 'stu',
      notes: null,
      files: [{ id: 'sf1' }],
      assignment: { ...assignmentRow, allowLate: false },
    });

    const { SubmissionsService } = await import('@/lib/submissions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new SubmissionsService(m as never);
    await expect(
      svc.submit('sub', {}, { userId: 'stu', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);

    vi.useRealTimers();
  });

  it('rejects empty submission (no files, no notes)', async () => {
    const m = buildMock();
    m.submission.findUnique.mockResolvedValue({
      id: 'sub',
      status: SubmissionStatus.DRAFT,
      studentId: 'stu',
      notes: null,
      files: [],
      assignment: assignmentRow,
    });

    const { SubmissionsService } = await import('@/lib/submissions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new SubmissionsService(m as never);
    await expect(
      svc.submit('sub', {}, { userId: 'stu', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects double submit', async () => {
    const m = buildMock();
    m.submission.findUnique.mockResolvedValue({
      id: 'sub',
      status: SubmissionStatus.SUBMITTED,
      studentId: 'stu',
      notes: 'already',
      files: [{ id: 'sf' }],
      assignment: assignmentRow,
    });

    const { SubmissionsService } = await import('@/lib/submissions/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new SubmissionsService(m as never);
    await expect(
      svc.submit('sub', {}, { userId: 'stu', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
