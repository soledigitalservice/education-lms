import { AuditAction, EnrollmentStatus, Prisma, Role, type PrismaClient } from '@prisma/client';

import { ApiError } from '../api/errors';
import { ensureUniqueSlug, slugify } from '../slug';
import type {
  CreateCourseInput,
  ListCoursesQuery,
  UpdateCourseInput,
} from './schemas';

export interface CourseDto {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  coverImageUrl: string | null;
  language: string;
  teacher: { id: string; fullName: string; avatarUrl: string | null };
  category: { id: string; name: string; slug: string } | null;
  requiresApproval: boolean;
  maxStudents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  /** Aggregate count of ACTIVE enrollments. */
  studentCount: number;
}

export interface PaginatedCourses {
  items: CourseDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Caller context — the service uses this to apply per-role visibility
 * rules without each route having to re-encode them.
 */
export interface CourseAuthCtx {
  userId: string;
  role: Role;
}

export class CoursesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- list / read -----------------------------------------------------

  /**
   * List courses with role-aware visibility.
   *
   *   ADMIN              → can ask for any status (defaults to "published")
   *   TEACHER (owner)    → can see their own drafts/archived
   *   STUDENT / PARENT   → only published, non-archived
   */
  async list(q: ListCoursesQuery, ctx: CourseAuthCtx): Promise<PaginatedCourses> {
    const where = this.buildWhere(q, ctx);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        include: this.courseInclude(),
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      items: rows.map((c) => this.toDto(c)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** Read a course by id OR slug. Throws 404 if not found or not visible. */
  async getByIdOrSlug(idOrSlug: string, ctx: CourseAuthCtx): Promise<CourseDto> {
    const where: Prisma.CourseWhereInput = idOrSlug.match(/^[a-z0-9]{20,30}$/)
      ? { id: idOrSlug }
      : { slug: idOrSlug };

    const course = await this.prisma.course.findFirst({
      where: { ...where, deletedAt: null },
      include: this.courseInclude(),
    });
    if (!course) throw ApiError.notFound('Course not found');

    // Visibility rules:
    //   - draft (publishedAt null)    → only teacher owner + admin
    //   - archived (archivedAt != null) → only teacher owner + admin + already-enrolled students
    if (!course.publishedAt && !this.canManageCourse(course, ctx)) {
      throw ApiError.notFound('Course not found');
    }
    if (course.archivedAt && !this.canManageCourse(course, ctx)) {
      const enrolled = await this.prisma.enrollment.findFirst({
        where: {
          courseId: course.id,
          studentId: ctx.userId,
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
        },
        select: { id: true },
      });
      if (!enrolled) throw ApiError.notFound('Course not found');
    }
    return this.toDto(course);
  }

  // ---- mutations -------------------------------------------------------

  async create(input: CreateCourseInput, ctx: CourseAuthCtx): Promise<CourseDto> {
    if (ctx.role !== Role.TEACHER && ctx.role !== Role.ADMIN) {
      throw ApiError.forbidden('Only teachers can create courses');
    }
    if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
      throw ApiError.badRequest('endsAt must be after startsAt');
    }
    if (input.categoryId) {
      const cat = await this.prisma.courseCategory.findUnique({ where: { id: input.categoryId } });
      if (!cat) throw ApiError.badRequest('Category does not exist');
    }

    const baseSlug = slugify(input.slug ?? input.title);
    const slug = await ensureUniqueSlug(
      baseSlug,
      async (s) => (await this.prisma.course.count({ where: { slug: s } })) === 0,
    );

    const created = await this.prisma.course.create({
      data: {
        title: input.title.trim(),
        slug,
        summary: input.summary?.trim() ?? null,
        description: input.description?.trim() ?? null,
        coverImageUrl: input.coverImageUrl ?? null,
        language: input.language,
        requiresApproval: input.requiresApproval,
        maxStudents: input.maxStudents ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        categoryId: input.categoryId ?? null,
        teacherId: ctx.userId,
      },
      include: this.courseInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.CREATE,
        entity: 'Course',
        entityId: created.id,
        metadata: { slug: created.slug },
      },
    });

    return this.toDto(created);
  }

  async update(id: string, input: UpdateCourseInput, ctx: CourseAuthCtx): Promise<CourseDto> {
    const course = await this.loadOrThrow(id);
    this.ensureCanManage(course, ctx);

    if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
      throw ApiError.badRequest('endsAt must be after startsAt');
    }

    let nextSlug = course.slug;
    if (input.slug !== undefined && input.slug !== course.slug) {
      nextSlug = await ensureUniqueSlug(
        slugify(input.slug),
        async (s) =>
          s === course.slug || (await this.prisma.course.count({ where: { slug: s } })) === 0,
      );
    }

    if (input.categoryId) {
      const cat = await this.prisma.courseCategory.findUnique({ where: { id: input.categoryId } });
      if (!cat) throw ApiError.badRequest('Category does not exist');
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        title: input.title?.trim() ?? course.title,
        slug: nextSlug,
        summary: input.summary !== undefined ? input.summary?.trim() ?? null : course.summary,
        description:
          input.description !== undefined ? input.description?.trim() ?? null : course.description,
        coverImageUrl:
          input.coverImageUrl !== undefined ? input.coverImageUrl ?? null : course.coverImageUrl,
        language: input.language ?? course.language,
        requiresApproval: input.requiresApproval ?? course.requiresApproval,
        maxStudents: input.maxStudents !== undefined ? input.maxStudents ?? null : course.maxStudents,
        startsAt: input.startsAt !== undefined ? input.startsAt ?? null : course.startsAt,
        endsAt: input.endsAt !== undefined ? input.endsAt ?? null : course.endsAt,
        categoryId: input.categoryId !== undefined ? input.categoryId ?? null : course.categoryId,
      },
      include: this.courseInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.UPDATE,
        entity: 'Course',
        entityId: id,
      },
    });

    return this.toDto(updated);
  }

  async publish(id: string, ctx: CourseAuthCtx): Promise<CourseDto> {
    const course = await this.loadOrThrow(id);
    this.ensureCanManage(course, ctx);

    if (course.publishedAt) {
      // Idempotent — already published.
      return this.toDto(await this.reloadFull(id));
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: { publishedAt: new Date(), archivedAt: null },
      include: this.courseInclude(),
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.UPDATE,
        entity: 'Course',
        entityId: id,
        metadata: { event: 'published' },
      },
    });
    return this.toDto(updated);
  }

  async archive(id: string, ctx: CourseAuthCtx): Promise<CourseDto> {
    const course = await this.loadOrThrow(id);
    this.ensureCanManage(course, ctx);
    if (course.archivedAt) return this.toDto(await this.reloadFull(id));

    const updated = await this.prisma.course.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: this.courseInclude(),
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.UPDATE,
        entity: 'Course',
        entityId: id,
        metadata: { event: 'archived' },
      },
    });
    return this.toDto(updated);
  }

  async softDelete(id: string, ctx: CourseAuthCtx): Promise<void> {
    const course = await this.loadOrThrow(id);
    this.ensureCanManage(course, ctx);
    if (course.deletedAt) return; // idempotent

    await this.prisma.$transaction([
      this.prisma.course.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'Course',
          entityId: id,
        },
      }),
    ]);
  }

  // ---- my-courses helpers (used by /me routes) -------------------------

  /** Courses owned by the given teacher (any status). */
  async listTaughtBy(teacherId: string): Promise<CourseDto[]> {
    const rows = await this.prisma.course.findMany({
      where: { teacherId, deletedAt: null },
      include: this.courseInclude(),
      orderBy: [{ archivedAt: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((c) => this.toDto(c));
  }

  // ---- internals -------------------------------------------------------

  private buildWhere(q: ListCoursesQuery, ctx: CourseAuthCtx): Prisma.CourseWhereInput {
    const base: Prisma.CourseWhereInput = { deletedAt: null };
    if (q.categoryId) base.categoryId = q.categoryId;
    if (q.teacherId) base.teacherId = q.teacherId;
    if (q.q) {
      base.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        { summary: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    switch (q.status) {
      case 'published':
        base.publishedAt = { not: null };
        base.archivedAt = null;
        break;
      case 'draft':
        // Drafts are private to their owner and admins.
        base.publishedAt = null;
        if (ctx.role !== Role.ADMIN) base.teacherId = ctx.userId;
        break;
      case 'archived':
        base.archivedAt = { not: null };
        if (ctx.role !== Role.ADMIN) base.teacherId = ctx.userId;
        break;
      case 'all':
        if (ctx.role !== Role.ADMIN) throw ApiError.forbidden('status=all is admin-only');
        break;
    }
    return base;
  }

  private async loadOrThrow(id: string) {
    const c = await this.prisma.course.findFirst({ where: { id, deletedAt: null } });
    if (!c) throw ApiError.notFound('Course not found');
    return c;
  }

  private async reloadFull(id: string) {
    const c = await this.prisma.course.findUnique({
      where: { id },
      include: this.courseInclude(),
    });
    if (!c) throw ApiError.notFound('Course not found');
    return c;
  }

  private canManageCourse(course: { teacherId: string }, ctx: CourseAuthCtx): boolean {
    return ctx.role === Role.ADMIN || course.teacherId === ctx.userId;
  }

  private ensureCanManage(course: { teacherId: string }, ctx: CourseAuthCtx): void {
    if (!this.canManageCourse(course, ctx)) throw ApiError.forbidden('Not your course');
  }

  private courseInclude() {
    return {
      teacher: { select: { id: true, fullName: true, avatarUrl: true } },
      category: { select: { id: true, name: true, slug: true } },
      _count: {
        select: {
          enrollments: { where: { status: EnrollmentStatus.ACTIVE } },
        },
      },
    } satisfies Prisma.CourseInclude;
  }

  private toDto(row: Prisma.CourseGetPayload<{ include: ReturnType<CoursesService['courseInclude']> }>): CourseDto {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      description: row.description,
      coverImageUrl: row.coverImageUrl,
      language: row.language,
      teacher: row.teacher,
      category: row.category,
      requiresApproval: row.requiresApproval,
      maxStudents: row.maxStudents,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      studentCount: row._count.enrollments,
    };
  }
}
