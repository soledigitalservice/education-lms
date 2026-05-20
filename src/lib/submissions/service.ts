import {
  AuditAction,
  EnrollmentStatus,
  Prisma,
  Role,
  SubmissionStatus,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import type { DraftSubmissionInput, SubmitSubmissionInput } from './schemas';

export interface SubmissionFileDto {
  id: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SubmissionDto {
  id: string;
  assignmentId: string;
  student: { id: string; fullName: string; email: string; avatarUrl: string | null };
  status: SubmissionStatus;
  notes: string | null;
  submittedAt: string | null;
  isLate: boolean;
  files: SubmissionFileDto[];
  createdAt: string;
  updatedAt: string;
  /// Populated when the teacher has graded the submission.
  grade: {
    id: string;
    scale: string;
    numericValue: number | null;
    conceptValue: string | null;
    letterValue: string | null;
    feedback: string | null;
    gradedAt: string;
  } | null;
}

export class SubmissionsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- student-side ----------------------------------------------------

  /**
   * Get-or-create the student's submission in DRAFT state. Idempotent.
   * If a submission already exists (any status), it is returned as-is —
   * the caller must use upsertDraft / submit / etc. to mutate.
   */
  async getOrCreateDraft(assignmentId: string, ctx: CourseAuthCtx): Promise<SubmissionDto> {
    this.ensureRoleCanSubmit(ctx);
    const assignment = await this.loadAssignmentWithCourse(assignmentId);
    if (!assignment.publishedAt) throw ApiError.notFound('Assignment not found');
    await this.ensureEnrolled(assignment.courseId, ctx);

    const existing = await this.prisma.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: ctx.userId } },
      include: this.submissionInclude(),
    });
    if (existing) return this.toDto(existing, assignment.dueAt);

    const created = await this.prisma.submission.create({
      data: {
        assignmentId,
        studentId: ctx.userId,
        status: SubmissionStatus.DRAFT,
      },
      include: this.submissionInclude(),
    });
    return this.toDto(created, assignment.dueAt);
  }

  async upsertDraft(
    submissionId: string,
    input: DraftSubmissionInput,
    ctx: CourseAuthCtx,
  ): Promise<SubmissionDto> {
    const sub = await this.loadSubmissionForStudent(submissionId, ctx);
    if (sub.status === SubmissionStatus.GRADED || sub.status === SubmissionStatus.SUBMITTED) {
      throw ApiError.badRequest(
        'This submission has already been submitted. Ask the teacher to RETURN it first.',
      );
    }
    if (input.addFileIds?.length) {
      await this.assertOwnsFiles(input.addFileIds, ctx);
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        notes: input.notes !== undefined ? input.notes : sub.notes,
        files: input.addFileIds?.length
          ? { create: input.addFileIds.map((fileId) => ({ fileId })) }
          : undefined,
      },
      include: this.submissionInclude(),
    });
    return this.toDto(updated, sub.assignment.dueAt);
  }

  async submit(
    submissionId: string,
    input: SubmitSubmissionInput,
    ctx: CourseAuthCtx,
  ): Promise<SubmissionDto> {
    const sub = await this.loadSubmissionForStudent(submissionId, ctx);
    if (sub.status === SubmissionStatus.SUBMITTED || sub.status === SubmissionStatus.GRADED) {
      throw ApiError.badRequest('Already submitted');
    }
    if (sub.files.length === 0 && !(input.notes ?? sub.notes ?? '').trim()) {
      throw ApiError.badRequest('Submission must include at least one file or some notes');
    }

    const now = new Date();
    const dueAt = sub.assignment.dueAt;
    const isLate = !!dueAt && now > dueAt;
    if (isLate && !sub.assignment.allowLate) {
      throw ApiError.badRequest('The due date has passed and this assignment does not allow late submissions');
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
        notes: input.notes !== undefined ? input.notes : sub.notes,
        submittedAt: now,
      },
      include: this.submissionInclude(),
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.UPDATE,
        entity: 'Submission',
        entityId: submissionId,
        metadata: { event: 'submit', isLate },
      },
    });
    return this.toDto(updated, sub.assignment.dueAt);
  }

  async removeFile(submissionFileId: string, ctx: CourseAuthCtx): Promise<void> {
    const sf = await this.prisma.submissionFile.findUnique({
      where: { id: submissionFileId },
      include: { submission: true },
    });
    if (!sf) throw ApiError.notFound('Submission file not found');
    if (sf.submission.studentId !== ctx.userId && ctx.role !== Role.ADMIN) {
      throw ApiError.forbidden('Not your submission');
    }
    if (
      sf.submission.status === SubmissionStatus.SUBMITTED ||
      sf.submission.status === SubmissionStatus.GRADED ||
      sf.submission.status === SubmissionStatus.LATE
    ) {
      throw ApiError.badRequest('Cannot edit a submitted submission');
    }
    await this.prisma.submissionFile.delete({ where: { id: submissionFileId } });
  }

  async listMine(ctx: CourseAuthCtx): Promise<SubmissionDto[]> {
    const rows = await this.prisma.submission.findMany({
      where: { studentId: ctx.userId },
      include: this.submissionInclude(),
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r, r.assignment.dueAt));
  }

  // ---- teacher-side ----------------------------------------------------

  async listForAssignment(
    assignmentId: string,
    ctx: CourseAuthCtx,
  ): Promise<SubmissionDto[]> {
    const a = await this.loadAssignmentWithCourse(assignmentId);
    this.ensureCanManage(a.course, ctx);
    const rows = await this.prisma.submission.findMany({
      where: { assignmentId },
      include: this.submissionInclude(),
      orderBy: [{ submittedAt: 'asc' }, { updatedAt: 'asc' }],
    });
    return rows.map((r) => this.toDto(r, r.assignment.dueAt));
  }

  async getById(submissionId: string, ctx: CourseAuthCtx): Promise<SubmissionDto> {
    const sub = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        ...this.submissionInclude(),
        assignment: {
          include: {
            course: { select: { id: true, teacherId: true, deletedAt: true } },
          },
        },
      },
    });
    if (!sub) throw ApiError.notFound('Submission not found');
    if (sub.assignment.course.deletedAt) throw ApiError.notFound('Course not found');
    const isManager =
      ctx.role === Role.ADMIN || sub.assignment.course.teacherId === ctx.userId;
    if (!isManager && sub.studentId !== ctx.userId) {
      throw ApiError.forbidden('Not your submission');
    }
    return this.toDto(sub, sub.assignment.dueAt);
  }

  /**
   * Teacher returns a submitted submission for revision so the student can
   * add more files / change notes and re-submit.
   */
  async returnForRevision(
    submissionId: string,
    ctx: CourseAuthCtx,
  ): Promise<SubmissionDto> {
    const sub = await this.loadSubmissionForManager(submissionId, ctx);
    if (
      sub.status !== SubmissionStatus.SUBMITTED &&
      sub.status !== SubmissionStatus.LATE
    ) {
      throw ApiError.badRequest(`Cannot return a submission in ${sub.status} state`);
    }
    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.RETURNED },
      include: this.submissionInclude(),
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.UPDATE,
        entity: 'Submission',
        entityId: submissionId,
        metadata: { event: 'returned' },
      },
    });
    return this.toDto(updated, updated.assignment.dueAt);
  }

  // ---- helpers ---------------------------------------------------------

  private async loadAssignmentWithCourse(assignmentId: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
    });
    if (!a || a.course.deletedAt) throw ApiError.notFound('Assignment not found');
    return a;
  }

  private async loadSubmissionForStudent(submissionId: string, ctx: CourseAuthCtx) {
    const sub = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        files: true,
        assignment: {
          include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
        },
      },
    });
    if (!sub) throw ApiError.notFound('Submission not found');
    if (sub.assignment.course.deletedAt) throw ApiError.notFound('Course not found');
    if (sub.studentId !== ctx.userId) throw ApiError.forbidden('Not your submission');
    return sub;
  }

  private async loadSubmissionForManager(submissionId: string, ctx: CourseAuthCtx) {
    const sub = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
        },
      },
    });
    if (!sub) throw ApiError.notFound('Submission not found');
    if (sub.assignment.course.deletedAt) throw ApiError.notFound('Course not found');
    this.ensureCanManage(sub.assignment.course, ctx);
    return sub;
  }

  private ensureRoleCanSubmit(ctx: CourseAuthCtx): void {
    if (ctx.role !== Role.STUDENT) {
      throw ApiError.forbidden('Only students can submit assignments');
    }
  }

  private ensureCanManage(
    course: { id: string; teacherId: string },
    ctx: CourseAuthCtx,
  ): void {
    if (ctx.role !== Role.ADMIN && course.teacherId !== ctx.userId) {
      throw ApiError.forbidden('Not your course');
    }
  }

  private async ensureEnrolled(courseId: string, ctx: CourseAuthCtx): Promise<void> {
    const enr = await this.prisma.enrollment.findFirst({
      where: {
        courseId,
        studentId: ctx.userId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
      },
      select: { id: true },
    });
    if (!enr) throw ApiError.forbidden('You are not enrolled in this course');
  }

  private async assertOwnsFiles(fileIds: string[], ctx: CourseAuthCtx): Promise<void> {
    const owned = await this.prisma.storedFile.count({
      where: { id: { in: fileIds }, uploaderId: ctx.userId },
    });
    if (owned !== fileIds.length) {
      throw ApiError.forbidden('One or more files were uploaded by another user');
    }
  }

  private submissionInclude() {
    return {
      student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      files: { include: { file: true }, orderBy: { createdAt: 'asc' } },
      grade: true,
      assignment: { select: { dueAt: true, allowLate: true, maxScore: true } },
    } satisfies Prisma.SubmissionInclude;
  }

  private toDto(
    row: Prisma.SubmissionGetPayload<{
      include: ReturnType<SubmissionsService['submissionInclude']>;
    }>,
    dueAt: Date | null,
  ): SubmissionDto {
    const isLate =
      !!dueAt &&
      !!row.submittedAt &&
      row.submittedAt > dueAt;
    return {
      id: row.id,
      assignmentId: row.assignmentId,
      student: row.student,
      status: row.status,
      notes: row.notes,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      isLate,
      files: row.files.map((sf) => ({
        id: sf.id,
        fileId: sf.fileId,
        originalName: sf.file.originalName,
        mimeType: sf.file.mimeType,
        sizeBytes: sf.file.sizeBytes,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      grade: row.grade
        ? {
            id: row.grade.id,
            scale: row.grade.scale,
            numericValue: row.grade.numericValue,
            conceptValue: row.grade.conceptValue,
            letterValue: row.grade.letterValue,
            feedback: row.grade.feedback,
            gradedAt: row.grade.gradedAt.toISOString(),
          }
        : null,
    };
  }
}
