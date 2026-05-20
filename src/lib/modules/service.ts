import { AuditAction, Prisma, Role, type PrismaClient } from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import type { CreateModuleInput, ReorderInput, UpdateModuleInput } from './schemas';

export interface ModuleDto {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  position: number;
  publishedAt: string | null;
  lessonCount: number;
}

export class ModulesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- list ------------------------------------------------------------

  async listForCourse(courseId: string): Promise<ModuleDto[]> {
    const rows = await this.prisma.module.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: { _count: { select: { lessons: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      title: r.title,
      description: r.description,
      position: r.position,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      lessonCount: r._count.lessons,
    }));
  }

  // ---- mutations -------------------------------------------------------

  async create(courseId: string, input: CreateModuleInput, ctx: CourseAuthCtx): Promise<ModuleDto> {
    const course = await this.ensureCanManage(courseId, ctx);
    // Position = max(existing) + 1 (compact, no gaps).
    const last = await this.prisma.module.findFirst({
      where: { courseId: course.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1;

    const created = await this.prisma.module.create({
      data: {
        courseId: course.id,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        position,
      },
      include: { _count: { select: { lessons: true } } },
    });
    await this.audit(ctx.userId, AuditAction.CREATE, created.id, { courseId, position });
    return this.toDto(created);
  }

  async update(moduleId: string, input: UpdateModuleInput, ctx: CourseAuthCtx): Promise<ModuleDto> {
    const m = await this.loadOrThrow(moduleId);
    await this.ensureCanManage(m.courseId, ctx);

    const updated = await this.prisma.module.update({
      where: { id: moduleId },
      data: {
        title: input.title?.trim() ?? m.title,
        description: input.description !== undefined ? input.description?.trim() ?? null : m.description,
        publishedAt: input.publishedAt !== undefined ? input.publishedAt : m.publishedAt,
      },
      include: { _count: { select: { lessons: true } } },
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, moduleId, {});
    return this.toDto(updated);
  }

  async reorder(moduleId: string, input: ReorderInput, ctx: CourseAuthCtx): Promise<void> {
    const m = await this.loadOrThrow(moduleId);
    await this.ensureCanManage(m.courseId, ctx);

    const neighbour = await this.prisma.module.findFirst({
      where: {
        courseId: m.courseId,
        position: input.direction === 'up' ? { lt: m.position } : { gt: m.position },
      },
      orderBy: { position: input.direction === 'up' ? 'desc' : 'asc' },
    });
    if (!neighbour) return; // already at the edge — no-op, idempotent

    // Atomic swap. The @@unique(courseId, position) constraint forces us to
    // temporarily move one row out of the positive range. We use a value
    // derived from the row's current position so two concurrent swaps in
    // the same course can't collide on the temp value.
    const temp = -m.position - 1;
    await this.prisma.$transaction([
      this.prisma.module.update({ where: { id: m.id }, data: { position: temp } }),
      this.prisma.module.update({ where: { id: neighbour.id }, data: { position: m.position } }),
      this.prisma.module.update({ where: { id: m.id }, data: { position: neighbour.position } }),
    ]);
    await this.audit(ctx.userId, AuditAction.UPDATE, moduleId, {
      event: 'reorder',
      direction: input.direction,
    });
  }

  async remove(moduleId: string, ctx: CourseAuthCtx): Promise<void> {
    const m = await this.loadOrThrow(moduleId);
    await this.ensureCanManage(m.courseId, ctx);

    // Compact positions after removal so the sequence stays 1..N.
    await this.prisma.$transaction([
      this.prisma.module.delete({ where: { id: moduleId } }),
      this.prisma.$executeRaw`
        UPDATE "Module"
        SET "position" = "position" - 1
        WHERE "courseId" = ${m.courseId} AND "position" > ${m.position}
      `,
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'Module',
          entityId: moduleId,
          metadata: { courseId: m.courseId },
        },
      }),
    ]);
  }

  // ---- helpers ---------------------------------------------------------

  private async loadOrThrow(moduleId: string) {
    const m = await this.prisma.module.findUnique({ where: { id: moduleId } });
    if (!m) throw ApiError.notFound('Module not found');
    return m;
  }

  private async ensureCanManage(
    courseId: string,
    ctx: CourseAuthCtx,
  ): Promise<{ id: string; teacherId: string }> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    if (ctx.role !== Role.ADMIN && course.teacherId !== ctx.userId) {
      throw ApiError.forbidden('Not your course');
    }
    return course;
  }

  private audit(actorId: string, action: AuditAction, entityId: string, metadata: Prisma.JsonValue) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entity: 'Module', entityId, metadata: metadata ?? undefined },
    });
  }

  private toDto(row: {
    id: string;
    courseId: string;
    title: string;
    description: string | null;
    position: number;
    publishedAt: Date | null;
    _count: { lessons: number };
  }): ModuleDto {
    return {
      id: row.id,
      courseId: row.courseId,
      title: row.title,
      description: row.description,
      position: row.position,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      lessonCount: row._count.lessons,
    };
  }
}
