import {
  AuditAction,
  EnrollmentStatus,
  NotificationKind,
  Prisma,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import { NotificationsService } from '../notifications/service';
import { UploadsService } from '../uploads/service';
import type {
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from './schemas';

export interface AssignmentAttachmentDto {
  id: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AssignmentDto {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  instructions: string | null;
  maxScore: number;
  dueAt: string | null;
  allowLate: boolean;
  latePenaltyPct: number;
  publishedAt: string | null;
  createdAt: string;
  attachments: AssignmentAttachmentDto[];
  /// Manager-only — null for students.
  submissionCount?: number;
}

export class AssignmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- read ------------------------------------------------------------

  async listForCourse(courseId: string, ctx: CourseAuthCtx): Promise<AssignmentDto[]> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    const isManager = ctx.role === Role.ADMIN || course.teacherId === ctx.userId;

    if (!isManager) {
      await this.ensureEnrolled(course.id, ctx);
    }

    const where: Prisma.AssignmentWhereInput = {
      courseId,
      ...(isManager ? {} : { publishedAt: { not: null } }),
    };
    const rows = await this.prisma.assignment.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      include: this.fullInclude(isManager),
    });
    return rows.map((r) => this.toDto(r, isManager));
  }

  async getById(assignmentId: string, ctx: CourseAuthCtx): Promise<AssignmentDto> {
    const a = await this.loadWithCourse(assignmentId);
    const isManager = ctx.role === Role.ADMIN || a.course.teacherId === ctx.userId;
    if (!isManager) {
      if (!a.publishedAt) throw ApiError.notFound('Assignment not found');
      await this.ensureEnrolled(a.courseId, ctx);
    }
    const full = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: this.fullInclude(isManager),
    });
    if (!full) throw ApiError.notFound('Assignment not found');
    return this.toDto(full, isManager);
  }

  // ---- mutations -------------------------------------------------------

  async createForCourse(
    courseId: string,
    input: CreateAssignmentInput,
    ctx: CourseAuthCtx,
  ): Promise<AssignmentDto> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    this.ensureCanManage(course, ctx);

    // Validate the optional lessonId belongs to this course.
    if (input.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        include: { module: { select: { courseId: true } } },
      });
      if (!lesson) throw ApiError.badRequest('lessonId does not exist');
      if (lesson.module.courseId !== courseId) {
        throw ApiError.badRequest('lessonId belongs to a different course');
      }
      // Make sure no other assignment already owns that lesson.
      const existing = await this.prisma.assignment.findUnique({
        where: { lessonId: input.lessonId },
      });
      if (existing) throw ApiError.conflict('That lesson already has an assignment');
    }

    // Validate attachments belong to the caller.
    if (input.attachmentFileIds && input.attachmentFileIds.length > 0) {
      await this.assertOwnsFiles(input.attachmentFileIds, ctx);
    }

    const created = await this.prisma.assignment.create({
      data: {
        courseId,
        lessonId: input.lessonId ?? null,
        title: input.title.trim(),
        instructions: input.instructions?.trim() ?? null,
        maxScore: input.maxScore,
        dueAt: input.dueAt ?? null,
        allowLate: input.allowLate,
        latePenaltyPct: input.latePenaltyPct,
        attachments: input.attachmentFileIds
          ? { create: input.attachmentFileIds.map((fileId) => ({ fileId })) }
          : undefined,
      },
      include: this.fullInclude(true),
    });
    await this.audit(ctx.userId, AuditAction.CREATE, created.id, {
      courseId,
      lessonId: input.lessonId ?? null,
    });
    return this.toDto(created, true);
  }

  async update(
    assignmentId: string,
    input: UpdateAssignmentInput,
    ctx: CourseAuthCtx,
  ): Promise<AssignmentDto> {
    const a = await this.loadWithCourse(assignmentId);
    this.ensureCanManage(a.course, ctx);

    const wasPublished = Boolean(a.publishedAt);
    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        title: input.title?.trim() ?? a.title,
        instructions:
          input.instructions !== undefined ? input.instructions?.trim() ?? null : a.instructions,
        maxScore: input.maxScore ?? a.maxScore,
        dueAt: input.dueAt !== undefined ? input.dueAt : a.dueAt,
        allowLate: input.allowLate ?? a.allowLate,
        latePenaltyPct: input.latePenaltyPct ?? a.latePenaltyPct,
        publishedAt: input.publishedAt !== undefined ? input.publishedAt : a.publishedAt,
      },
      include: this.fullInclude(true),
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, assignmentId, {});

    // Publication transition: notify every enrolled student exactly once
    // (the dedupKey ensures re-publishes don't re-spam).
    if (!wasPublished && updated.publishedAt) {
      void this.notifyEnrolledOnPublish(updated.id, updated.title, updated.courseId, updated.lessonId);
    }

    return this.toDto(updated, true);
  }

  private async notifyEnrolledOnPublish(
    assignmentId: string,
    assignmentTitle: string,
    courseId: string,
    lessonId: string | null,
  ): Promise<void> {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: {
          slug: true,
          title: true,
          enrollments: {
            where: { status: EnrollmentStatus.ACTIVE },
            select: { studentId: true },
          },
        },
      });
      if (!course) return;
      const notifications = new NotificationsService(this.prisma);
      const link = lessonId
        ? `/courses/${course.slug}/lessons/${lessonId}`
        : `/courses/${course.slug}`;
      for (const enr of course.enrollments) {
        await notifications.dispatch({
          userId: enr.studentId,
          kind: NotificationKind.ASSIGNMENT_PUBLISHED,
          title: assignmentTitle,
          body: `Nueva tarea en "${course.title}": ${assignmentTitle}.`,
          link,
          dedupKey: `assignment_published:${assignmentId}`,
        });
      }
    } catch {
      // best-effort
    }
  }

  async addAttachment(
    assignmentId: string,
    fileId: string,
    ctx: CourseAuthCtx,
  ): Promise<AssignmentDto> {
    const a = await this.loadWithCourse(assignmentId);
    this.ensureCanManage(a.course, ctx);
    await this.assertOwnsFiles([fileId], ctx);
    await this.prisma.assignmentAttachment.create({
      data: { assignmentId, fileId },
    });
    return this.getById(assignmentId, ctx);
  }

  async removeAttachment(
    attachmentId: string,
    ctx: CourseAuthCtx,
  ): Promise<void> {
    const att = await this.prisma.assignmentAttachment.findUnique({
      where: { id: attachmentId },
      include: { assignment: { include: { course: true } } },
    });
    if (!att) throw ApiError.notFound('Attachment not found');
    this.ensureCanManage(att.assignment.course, ctx);

    await this.prisma.assignmentAttachment.delete({ where: { id: attachmentId } });

    // If no other reference, drop the StoredFile + S3 object too.
    const stillRefd = await this.prisma.assignmentAttachment.count({
      where: { fileId: att.fileId },
    });
    const referencedAsMaterial = await this.prisma.material.count({
      where: { fileId: att.fileId },
    });
    const referencedAsSubmission = await this.prisma.submissionFile.count({
      where: { fileId: att.fileId },
    });
    if (stillRefd + referencedAsMaterial + referencedAsSubmission === 0) {
      const uploads = new UploadsService({ prisma: this.prisma, uploaderId: ctx.userId });
      await uploads.deleteFile(att.fileId).catch(() => undefined);
    }
  }

  async remove(assignmentId: string, ctx: CourseAuthCtx): Promise<void> {
    const a = await this.loadWithCourse(assignmentId);
    this.ensureCanManage(a.course, ctx);
    await this.prisma.$transaction([
      this.prisma.assignment.delete({ where: { id: assignmentId } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'Assignment',
          entityId: assignmentId,
          metadata: { courseId: a.courseId, lessonId: a.lessonId },
        },
      }),
    ]);
  }

  // ---- helpers ---------------------------------------------------------

  private async loadWithCourse(assignmentId: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
    });
    if (!a || a.course.deletedAt) throw ApiError.notFound('Assignment not found');
    return a;
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
    const enrolled = await this.prisma.enrollment.findFirst({
      where: {
        courseId,
        studentId: ctx.userId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
      },
      select: { id: true },
    });
    if (!enrolled) throw ApiError.notFound('Assignment not found');
  }

  private async assertOwnsFiles(fileIds: string[], ctx: CourseAuthCtx): Promise<void> {
    if (ctx.role === Role.ADMIN) return;
    const owned = await this.prisma.storedFile.count({
      where: { id: { in: fileIds }, uploaderId: ctx.userId },
    });
    if (owned !== fileIds.length) {
      throw ApiError.forbidden('One or more attachments were uploaded by another user');
    }
  }

  private audit(
    actorId: string,
    action: AuditAction,
    entityId: string,
    metadata: Prisma.JsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entity: 'Assignment',
        entityId,
        metadata: metadata ?? undefined,
      },
    });
  }

  private fullInclude(isManager: boolean) {
    return {
      attachments: { include: { file: true }, orderBy: { createdAt: 'asc' } },
      ...(isManager ? { _count: { select: { submissions: true } } } : {}),
    } satisfies Prisma.AssignmentInclude;
  }

  private toDto(
    row: {
      id: string;
      courseId: string;
      lessonId: string | null;
      title: string;
      instructions: string | null;
      maxScore: number;
      dueAt: Date | null;
      allowLate: boolean;
      latePenaltyPct: number;
      publishedAt: Date | null;
      createdAt: Date;
      attachments: Array<{
        id: string;
        fileId: string;
        file: { originalName: string; mimeType: string; sizeBytes: number };
      }>;
      _count?: { submissions: number };
    },
    isManager: boolean,
  ): AssignmentDto {
    return {
      id: row.id,
      courseId: row.courseId,
      lessonId: row.lessonId,
      title: row.title,
      instructions: row.instructions,
      maxScore: row.maxScore,
      dueAt: row.dueAt?.toISOString() ?? null,
      allowLate: row.allowLate,
      latePenaltyPct: row.latePenaltyPct,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      attachments: row.attachments.map((att) => ({
        id: att.id,
        fileId: att.fileId,
        originalName: att.file.originalName,
        mimeType: att.file.mimeType,
        sizeBytes: att.file.sizeBytes,
      })),
      ...(isManager ? { submissionCount: row._count?.submissions ?? 0 } : {}),
    };
  }
}
