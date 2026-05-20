import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GradeScale, Role, SubmissionStatus } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    submission: { findUnique: vi.fn(), update: vi.fn() },
    quizAttempt: { findUnique: vi.fn() },
    course: { findFirst: vi.fn() },
    grade: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
}

const courseRow = { id: 'crs', teacherId: 'tch', deletedAt: null };

describe('GradesService.upsertForSubmission', () => {
  it('rejects when numericValue exceeds maxScore', async () => {
    const m = buildMock();
    m.submission.findUnique.mockResolvedValue({
      id: 'sub',
      studentId: 'stu',
      status: SubmissionStatus.SUBMITTED,
      assignment: { maxScore: 100, course: courseRow },
    });
    const { GradesService } = await import('@/lib/grades/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new GradesService(m as never);
    await expect(
      svc.upsertForSubmission(
        'sub',
        { scale: GradeScale.NUMERIC, numericValue: 150 },
        { userId: 'tch', role: Role.TEACHER },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects grading a DRAFT submission', async () => {
    const m = buildMock();
    m.submission.findUnique.mockResolvedValue({
      id: 'sub',
      studentId: 'stu',
      status: SubmissionStatus.DRAFT,
      assignment: { maxScore: 100, course: courseRow },
    });
    const { GradesService } = await import('@/lib/grades/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new GradesService(m as never);
    await expect(
      svc.upsertForSubmission(
        'sub',
        { scale: GradeScale.NUMERIC, numericValue: 50 },
        { userId: 'tch', role: Role.TEACHER },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('flips submission to GRADED on first grade write', async () => {
    const m = buildMock();
    m.submission.findUnique.mockResolvedValue({
      id: 'sub',
      studentId: 'stu',
      status: SubmissionStatus.SUBMITTED,
      assignment: { maxScore: 100, course: courseRow },
    });
    m.grade.upsert.mockResolvedValue({ id: 'g1' });
    m.grade.findUnique.mockResolvedValue({
      id: 'g1',
      studentId: 'stu',
      graderId: 'tch',
      scale: GradeScale.NUMERIC,
      numericValue: 90,
      conceptValue: null,
      letterValue: null,
      feedback: 'Nice work',
      gradedAt: new Date(),
      student: { id: 'stu', fullName: 'Stu' },
      grader: { id: 'tch', fullName: 'Teacher' },
      submission: {
        id: 'sub',
        assignmentId: 'asg',
        assignment: { title: 'HW1', course: { id: 'crs', title: 'C', teacherId: 'tch' } },
      },
      quizAttempt: null,
    });

    const { GradesService } = await import('@/lib/grades/service');
    const svc = new GradesService(m as never);
    const result = await svc.upsertForSubmission(
      'sub',
      { scale: GradeScale.NUMERIC, numericValue: 90, feedback: 'Nice work' },
      { userId: 'tch', role: Role.TEACHER },
    );

    expect(result.numericValue).toBe(90);
    expect(m.submission.update).toHaveBeenCalledWith({
      where: { id: 'sub' },
      data: { status: SubmissionStatus.GRADED },
    });
  });
});
