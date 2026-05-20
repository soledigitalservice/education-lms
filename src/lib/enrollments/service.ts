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

export interface EnrollmentDto {
  id: string;
  courseId: string;
  course?: {
    id: string;
    title: string;
    slug: string;
    coverImageUrl: string | null;
    teacher: { id: string; fullName: string };
  };
  student: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
  status: EnrollmentStatus;
  requestedAt: string;
  decidedAt: string | null;
  removedAt: string | null;
  reason: string | null;
}

export class EnrollmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  // -------------------------------------------------------- student-side

  /**
   * Student requests enrollment in a course.
   *   - Course must be published, not archived, not deleted.
   *   - If course.requiresApproval=false → instantly ACTIVE.
   *   - Otherwise → PENDING.
   *   - Idempotent: if a non-terminal enrollment already exists, return it.
   */
  async request(courseId: string, ctx: CourseAuthCtx): Promise<EnrollmentDto> {
    if (ctx.role !== Role.STUDENT) {
      throw ApiError.forbidden('Only students can request course enrollment');
    }
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
    });
    if (!course) throw ApiError.notFound('Course not found');
    if (!course.publishedAt) throw ApiError.badRequest('Course is not open for enrollment');
    if (course.archivedAt) throw ApiError.badRequest('Course is archived');

    const existing = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId: ctx.userId } },
    });

    if (existing) {
      // Idempotent for in-flight states.
      if (
        existing.status === EnrollmentStatus.PENDING ||
        existing.status === EnrollmentStatus.ACTIVE
      ) {
        return this.toDto(await this.reloadFull(existing.id));
      }
      // Re-request after removal/rejection: revive the same row.
      if (
        existing.status === EnrollmentStatus.REJECTED ||
        existing.status === EnrollmentStatus.REMOVED
      ) {
        const reEnrolled = await this.prisma.enrollment.update({
          where: { id: existing.id },
          data: {
            status: course.requiresApproval
              ? EnrollmentStatus.PENDING
              : EnrollmentStatus.ACTIVE,
            requestedAt: new Date(),
            decidedAt: course.requiresApproval ? null : new Date(),
            removedAt: null,
            reason: null,
          },
        });
        return this.toDto(await this.reloadFull(reEnrolled.id));
      }
      // COMPLETED — don't auto-renew.
      throw ApiError.conflict('You have already completed this course');
    }

    if (course.maxStudents !== null) {
      const activeCount = await this.prisma.enrollment.count({
        where: { courseId, status: EnrollmentStatus.ACTIVE },
      });
      if (activeCount >= course.maxStudents) {
        throw ApiError.conflict('Course is at maximum capacity');
      }
    }

    const created = await this.prisma.enrollment.create({
      data: {
        courseId,
        studentId: ctx.userId,
        status: course.requiresApproval
          ? EnrollmentStatus.PENDING
          : EnrollmentStatus.ACTIVE,
        decidedAt: course.requiresApproval ? null : new Date(),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.CREATE,
        entity: 'Enrollment',
        entityId: created.id,
        metadata: { courseId, autoApproved: !course.requiresApproval },
      },
    });

    // Notify the course teacher of a new pending request (only when manual approval).
    if (course.requiresApproval) {
      void new NotificationsService(this.prisma).dispatch({
        userId: course.teacherId,
        kind: NotificationKind.ENROLLMENT_REQUESTED,
        title: course.title,
        body: 'Un nuevo estudiante ha solicitado inscribirse en tu curso.',
        link: `/courses/${course.slug}/students`,
      });
    }

    return this.toDto(await this.reloadFull(created.id));
  }

  /** Student leaves a course they're in. */
  async leave(courseId: string, ctx: CourseAuthCtx): Promise<void> {
    const existing = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId: ctx.userId } },
    });
    if (!existing) throw ApiError.notFound('You are not enrolled');
    if (
      existing.status === EnrollmentStatus.REMOVED ||
      existing.status === EnrollmentStatus.REJECTED
    ) {
      return; // idempotent
    }
    await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: EnrollmentStatus.REMOVED, removedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.UPDATE,
          entity: 'Enrollment',
          entityId: existing.id,
          metadata: { event: 'self_leave' },
        },
      }),
    ]);
  }

  /** All enrollments belonging to a student (used by the student dashboard). */
  async listForStudent(studentId: string): Promise<EnrollmentDto[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId },
      include: this.enrollmentInclude(),
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  // -------------------------------------------------------- teacher-side

  /** List enrollments for one course; teacher-owner or admin only. */
  async listForCourse(
    courseId: string,
    statusFilter: EnrollmentStatus | undefined,
    ctx: CourseAuthCtx,
  ): Promise<EnrollmentDto[]> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
    });
    if (!course) throw ApiError.notFound('Course not found');
    if (ctx.role !== Role.ADMIN && course.teacherId !== ctx.userId) {
      throw ApiError.forbidden('Not your course');
    }
    const rows = await this.prisma.enrollment.findMany({
      where: { courseId, ...(statusFilter ? { status: statusFilter } : {}) },
      include: this.enrollmentInclude(),
      orderBy: { requestedAt: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async approve(enrollmentId: string, ctx: CourseAuthCtx): Promise<EnrollmentDto> {
    const enr = await this.loadEnrollmentWithCourse(enrollmentId);
    this.ensureTeacherOwnerOrAdmin(enr.course.teacherId, ctx);

    if (enr.status === EnrollmentStatus.ACTIVE) {
      return this.toDto(await this.reloadFull(enr.id));
    }
    if (enr.status !== EnrollmentStatus.PENDING) {
      throw ApiError.badRequest(`Cannot approve enrollment in ${enr.status} state`);
    }
    if (enr.course.maxStudents !== null) {
      const activeCount = await this.prisma.enrollment.count({
        where: { courseId: enr.courseId, status: EnrollmentStatus.ACTIVE },
      });
      if (activeCount >= enr.course.maxStudents) {
        throw ApiError.conflict('Course is at maximum capacity');
      }
    }

    await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: EnrollmentStatus.ACTIVE,
          decidedAt: new Date(),
          decidedById: ctx.userId,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.APPROVE,
          entity: 'Enrollment',
          entityId: enrollmentId,
        },
      }),
    ]);

    // Auto-add the now-active student to the course chat room. Best-effort:
    // failure here MUST NOT roll back the enrollment approval — the student
    // can be added manually later from the course page if needed.
    try {
      const { ChatService } = await import('../chat/service');
      await new ChatService(this.prisma).ensureCourseRoomMembership(
        enr.courseId,
        enr.studentId,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to auto-join chat for enrollment ${enrollmentId}:`, err);
    }

    void new NotificationsService(this.prisma).dispatch({
      userId: enr.studentId,
      kind: NotificationKind.ENROLLMENT_APPROVED,
      title: enr.course.title,
      body: `Tu solicitud de inscripción en "${enr.course.title}" ha sido aprobada.`,
      link: `/courses/${enr.course.slug}`,
    });

    return this.toDto(await this.reloadFull(enrollmentId));
  }

  async reject(
    enrollmentId: string,
    reason: string | undefined,
    ctx: CourseAuthCtx,
  ): Promise<EnrollmentDto> {
    const enr = await this.loadEnrollmentWithCourse(enrollmentId);
    this.ensureTeacherOwnerOrAdmin(enr.course.teacherId, ctx);
    if (enr.status !== EnrollmentStatus.PENDING) {
      throw ApiError.badRequest(`Cannot reject enrollment in ${enr.status} state`);
    }

    await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: EnrollmentStatus.REJECTED,
          decidedAt: new Date(),
          decidedById: ctx.userId,
          reason: reason ?? null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.REJECT,
          entity: 'Enrollment',
          entityId: enrollmentId,
          metadata: { reason: reason ?? null },
        },
      }),
    ]);

    void new NotificationsService(this.prisma).dispatch({
      userId: enr.studentId,
      kind: NotificationKind.ENROLLMENT_REJECTED,
      title: enr.course.title,
      body: reason
        ? `Tu inscripción fue rechazada. Motivo: ${reason}`
        : 'Tu solicitud de inscripción fue rechazada por el profesor.',
      link: `/courses/${enr.course.slug}`,
    });

    return this.toDto(await this.reloadFull(enrollmentId));
  }

  /** Teacher removes an ACTIVE student from the course. */
  async remove(
    enrollmentId: string,
    reason: string | undefined,
    ctx: CourseAuthCtx,
  ): Promise<EnrollmentDto> {
    const enr = await this.loadEnrollmentWithCourse(enrollmentId);
    this.ensureTeacherOwnerOrAdmin(enr.course.teacherId, ctx);
    if (enr.status !== EnrollmentStatus.ACTIVE) {
      throw ApiError.badRequest(`Cannot remove enrollment in ${enr.status} state`);
    }
    await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: EnrollmentStatus.REMOVED,
          removedAt: new Date(),
          decidedById: ctx.userId,
          reason: reason ?? null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.UPDATE,
          entity: 'Enrollment',
          entityId: enrollmentId,
          metadata: { event: 'teacher_removed', reason: reason ?? null },
        },
      }),
    ]);

    void new NotificationsService(this.prisma).dispatch({
      userId: enr.studentId,
      kind: NotificationKind.ENROLLMENT_REMOVED,
      title: enr.course.title,
      body: reason
        ? `Has sido dado de baja del curso. Motivo: ${reason}`
        : 'Has sido dado de baja del curso por el profesor.',
      link: `/courses`,
    });

    return this.toDto(await this.reloadFull(enrollmentId));
  }

  // ---- helpers ---------------------------------------------------------

  private async loadEnrollmentWithCourse(enrollmentId: string) {
    const enr = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: true },
    });
    if (!enr) throw ApiError.notFound('Enrollment not found');
    if (enr.course.deletedAt) throw ApiError.notFound('Course not found');
    return enr;
  }

  private async reloadFull(enrollmentId: string) {
    const enr = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: this.enrollmentInclude(),
    });
    if (!enr) throw ApiError.notFound('Enrollment not found');
    return enr;
  }

  private ensureTeacherOwnerOrAdmin(teacherId: string, ctx: CourseAuthCtx): void {
    if (ctx.role !== Role.ADMIN && teacherId !== ctx.userId) {
      throw ApiError.forbidden('Not your course');
    }
  }

  private enrollmentInclude() {
    return {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          coverImageUrl: true,
          teacher: { select: { id: true, fullName: true } },
        },
      },
      student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
    } satisfies Prisma.EnrollmentInclude;
  }

  private toDto(
    row: Prisma.EnrollmentGetPayload<{ include: ReturnType<EnrollmentsService['enrollmentInclude']> }>,
  ): EnrollmentDto {
    return {
      id: row.id,
      courseId: row.courseId,
      course: row.course
        ? {
            id: row.course.id,
            title: row.course.title,
            slug: row.course.slug,
            coverImageUrl: row.course.coverImageUrl,
            teacher: row.course.teacher,
          }
        : undefined,
      student: row.student,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      removedAt: row.removedAt?.toISOString() ?? null,
      reason: row.reason,
    };
  }
}
