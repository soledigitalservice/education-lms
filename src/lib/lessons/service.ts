import {
  AuditAction,
  EnrollmentStatus,
  LessonType,
  Prisma,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import type {
  CreateLessonInput,
  ReorderLessonInput,
  UpdateLessonInput,
} from './schemas';

export interface LessonDto {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  content: string | null;
  type: LessonType;
  position: number;
  durationMin: number | null;
  publishedAt: string | null;
  materialCount: number;
}

export class LessonsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- read ------------------------------------------------------------

  async listForModule(moduleId: string, ctx: CourseAuthCtx): Promise<LessonDto[]> {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
      include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
    });
    if (!mod || mod.course.deletedAt) throw ApiError.notFound('Module not found');
    await this.ensureCanRead(mod.course, ctx);

    const isManager = ctx.role === Role.ADMIN || mod.course.teacherId === ctx.userId;
    const where: Prisma.LessonWhereInput = isManager
      ? { moduleId }
      : { moduleId, publishedAt: { not: null } };

    const rows = await this.prisma.lesson.findMany({
      where,
      orderBy: { position: 'asc' },
      include: { _count: { select: { materials: true } } },
    });
    return rows.map((r) => this.toDto(r, mod.courseId));
  }

  async getById(lessonId: string, ctx: CourseAuthCtx): Promise<LessonDto> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
        },
        _count: { select: { materials: true } },
      },
    });
    if (!lesson || lesson.module.course.deletedAt) {
      throw ApiError.notFound('Lesson not found');
    }
    await this.ensureCanRead(lesson.module.course, ctx);

    const isManager =
      ctx.role === Role.ADMIN || lesson.module.course.teacherId === ctx.userId;
    if (!lesson.publishedAt && !isManager) {
      throw ApiError.notFound('Lesson not found');
    }

    return this.toDto(lesson, lesson.module.courseId);
  }

  // ---- mutations -------------------------------------------------------

  async create(
    moduleId: string,
    input: CreateLessonInput,
    ctx: CourseAuthCtx,
  ): Promise<LessonDto> {
    const mod = await this.ensureCanManageModule(moduleId, ctx);
    const last = await this.prisma.lesson.findFirst({
      where: { moduleId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1;

    const created = await this.prisma.lesson.create({
      data: {
        moduleId,
        title: input.title.trim(),
        content: input.content?.trim() ?? null,
        type: input.type,
        durationMin: input.durationMin ?? null,
        position,
      },
      include: { _count: { select: { materials: true } } },
    });
    await this.audit(ctx.userId, AuditAction.CREATE, created.id, { moduleId, position });
    return this.toDto(created, mod.courseId);
  }

  async update(
    lessonId: string,
    input: UpdateLessonInput,
    ctx: CourseAuthCtx,
  ): Promise<LessonDto> {
    const lesson = await this.loadOrThrow(lessonId);
    const mod = await this.ensureCanManageModule(lesson.moduleId, ctx);

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: input.title?.trim() ?? lesson.title,
        content: input.content !== undefined ? input.content?.trim() ?? null : lesson.content,
        type: input.type ?? lesson.type,
        durationMin: input.durationMin !== undefined ? input.durationMin ?? null : lesson.durationMin,
        publishedAt: input.publishedAt !== undefined ? input.publishedAt : lesson.publishedAt,
      },
      include: { _count: { select: { materials: true } } },
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, lessonId, {});
    return this.toDto(updated, mod.courseId);
  }

  async publish(lessonId: string, ctx: CourseAuthCtx): Promise<LessonDto> {
    const lesson = await this.loadOrThrow(lessonId);
    const mod = await this.ensureCanManageModule(lesson.moduleId, ctx);
    if (lesson.publishedAt) {
      // Already published — return current state.
      const fresh = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { _count: { select: { materials: true } } },
      });
      return this.toDto(fresh!, mod.courseId);
    }
    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { publishedAt: new Date() },
      include: { _count: { select: { materials: true } } },
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, lessonId, { event: 'published' });
    return this.toDto(updated, mod.courseId);
  }

  async reorder(
    lessonId: string,
    input: ReorderLessonInput,
    ctx: CourseAuthCtx,
  ): Promise<void> {
    const lesson = await this.loadOrThrow(lessonId);
    await this.ensureCanManageModule(lesson.moduleId, ctx);

    const neighbour = await this.prisma.lesson.findFirst({
      where: {
        moduleId: lesson.moduleId,
        position: input.direction === 'up' ? { lt: lesson.position } : { gt: lesson.position },
      },
      orderBy: { position: input.direction === 'up' ? 'desc' : 'asc' },
    });
    if (!neighbour) return; // already at edge — idempotent

    const temp = -lesson.position - 1;
    await this.prisma.$transaction([
      this.prisma.lesson.update({ where: { id: lesson.id }, data: { position: temp } }),
      this.prisma.lesson.update({ where: { id: neighbour.id }, data: { position: lesson.position } }),
      this.prisma.lesson.update({
        where: { id: lesson.id },
        data: { position: neighbour.position },
      }),
    ]);
    await this.audit(ctx.userId, AuditAction.UPDATE, lessonId, {
      event: 'reorder',
      direction: input.direction,
    });
  }

  async remove(lessonId: string, ctx: CourseAuthCtx): Promise<void> {
    const lesson = await this.loadOrThrow(lessonId);
    await this.ensureCanManageModule(lesson.moduleId, ctx);

    await this.prisma.$transaction([
      this.prisma.lesson.delete({ where: { id: lessonId } }),
      this.prisma.$executeRaw`
        UPDATE "Lesson"
        SET "position" = "position" - 1
        WHERE "moduleId" = ${lesson.moduleId} AND "position" > ${lesson.position}
      `,
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'Lesson',
          entityId: lessonId,
          metadata: { moduleId: lesson.moduleId },
        },
      }),
    ]);
  }

  // ---- helpers ---------------------------------------------------------

  private async loadOrThrow(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw ApiError.notFound('Lesson not found');
    return lesson;
  }

  private async ensureCanManageModule(moduleId: string, ctx: CourseAuthCtx) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
      include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
    });
    if (!mod || mod.course.deletedAt) throw ApiError.notFound('Module not found');
    if (ctx.role !== Role.ADMIN && mod.course.teacherId !== ctx.userId) {
      throw ApiError.forbidden('Not your course');
    }
    return { id: mod.id, courseId: mod.courseId };
  }

  /**
   * Read-access check: callable by the teacher-owner, admin, or any
   * student/parent with an ACTIVE/COMPLETED enrollment.
   * Non-published courses are visible only to owner+admin.
   */
  private async ensureCanRead(
    course: { id: string; teacherId: string },
    ctx: CourseAuthCtx,
  ): Promise<void> {
    if (ctx.role === Role.ADMIN || course.teacherId === ctx.userId) return;
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        courseId: course.id,
        studentId: ctx.userId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
      },
      select: { id: true },
    });
    if (!enrollment) throw ApiError.notFound('Module not found');
  }

  private audit(actorId: string, action: AuditAction, entityId: string, metadata: Prisma.JsonValue) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entity: 'Lesson', entityId, metadata: metadata ?? undefined },
    });
  }

  private toDto(
    row: {
      id: string;
      moduleId: string;
      title: string;
      content: string | null;
      type: LessonType;
      position: number;
      durationMin: number | null;
      publishedAt: Date | null;
      _count: { materials: number };
    },
    courseId: string,
  ): LessonDto {
    return {
      id: row.id,
      moduleId: row.moduleId,
      courseId,
      title: row.title,
      content: row.content,
      type: row.type,
      position: row.position,
      durationMin: row.durationMin,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      materialCount: row._count.materials,
    };
  }
}
