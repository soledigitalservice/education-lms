import {
  AuditAction,
  EnrollmentStatus,
  MaterialType,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import { UploadsService } from '../uploads/service';
import type { CreateMaterialInput } from './schemas';

export interface MaterialDto {
  id: string;
  title: string;
  type: MaterialType;
  url: string;
  fileId: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

/**
 * MaterialsService — attaches materials to a lesson OR to a course
 * (course-level bibliography). Visibility:
 *   - manage: course owner + admin
 *   - read  : enrolled students/parents + manage
 */
export class MaterialsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- list ------------------------------------------------------------

  async listForLesson(lessonId: string, ctx: CourseAuthCtx): Promise<MaterialDto[]> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { course: { select: { id: true, teacherId: true, deletedAt: true } } } } },
    });
    if (!lesson || lesson.module.course.deletedAt) throw ApiError.notFound('Lesson not found');
    await this.ensureCanRead(lesson.module.course, ctx);
    return this.toDtos(
      await this.prisma.material.findMany({
        where: { lessonId },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async listForCourse(courseId: string, ctx: CourseAuthCtx): Promise<MaterialDto[]> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true, deletedAt: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    await this.ensureCanRead(course, ctx);
    return this.toDtos(
      await this.prisma.material.findMany({
        where: { courseId, lessonId: null },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  // ---- mutations -------------------------------------------------------

  async createForLesson(
    lessonId: string,
    input: CreateMaterialInput,
    ctx: CourseAuthCtx,
  ): Promise<MaterialDto> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { course: { select: { id: true, teacherId: true, deletedAt: true } } } } },
    });
    if (!lesson || lesson.module.course.deletedAt) throw ApiError.notFound('Lesson not found');
    this.ensureCanManage(lesson.module.course, ctx);
    return this.create({ lessonId, courseId: null, input, ctx });
  }

  async createForCourse(
    courseId: string,
    input: CreateMaterialInput,
    ctx: CourseAuthCtx,
  ): Promise<MaterialDto> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true, deletedAt: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    this.ensureCanManage(course, ctx);
    return this.create({ lessonId: null, courseId, input, ctx });
  }

  async remove(materialId: string, ctx: CourseAuthCtx): Promise<void> {
    const m = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: {
        lesson: { include: { module: { select: { course: { select: { id: true, teacherId: true, deletedAt: true } } } } } },
        course: { select: { id: true, teacherId: true, deletedAt: true } },
      },
    });
    if (!m) throw ApiError.notFound('Material not found');

    const course = m.lesson?.module.course ?? m.course;
    if (!course || course.deletedAt) throw ApiError.notFound('Course not found');
    this.ensureCanManage(course, ctx);

    await this.prisma.$transaction([
      this.prisma.material.delete({ where: { id: materialId } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'Material',
          entityId: materialId,
          metadata: { lessonId: m.lessonId, courseId: m.courseId, fileId: m.fileId },
        },
      }),
    ]);
    // Best-effort orphan cleanup: if the material was the only reference to
    // its StoredFile, drop the S3 object too. We DON'T propagate errors here.
    if (m.fileId) {
      const stillReferenced = await this.prisma.material.count({
        where: { fileId: m.fileId },
      });
      if (stillReferenced === 0) {
        const uploads = new UploadsService({ prisma: this.prisma, uploaderId: ctx.userId });
        await uploads.deleteFile(m.fileId).catch(() => undefined);
      }
    }
  }

  /**
   * Resolve a presigned download URL for the file behind a material.
   * Permission: same as listForLesson/listForCourse — caller must be enrolled
   * or be the teacher-owner / admin.
   */
  async getDownloadUrl(
    materialId: string,
    ctx: CourseAuthCtx,
  ): Promise<{ url: string; originalName: string; mimeType: string; sizeBytes: number }> {
    const m = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: {
        lesson: { include: { module: { select: { course: { select: { id: true, teacherId: true, deletedAt: true } } } } } },
        course: { select: { id: true, teacherId: true, deletedAt: true } },
      },
    });
    if (!m) throw ApiError.notFound('Material not found');
    const course = m.lesson?.module.course ?? m.course;
    if (!course || course.deletedAt) throw ApiError.notFound('Course not found');
    await this.ensureCanRead(course, ctx);

    if (!m.fileId) throw ApiError.badRequest('This material is a link, not a downloadable file');
    const uploads = new UploadsService({ prisma: this.prisma, uploaderId: ctx.userId });
    return uploads.getDownloadUrl(m.fileId);
  }

  // ---- internals -------------------------------------------------------

  private async create(args: {
    lessonId: string | null;
    courseId: string | null;
    input: CreateMaterialInput;
    ctx: CourseAuthCtx;
  }): Promise<MaterialDto> {
    let url = '';
    let fileId: string | null = null;
    let sizeBytes: number | null = null;
    let mimeType: string | null = null;

    if (args.input.source === 'upload') {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: args.input.fileId },
        select: { id: true, key: true, mimeType: true, sizeBytes: true, uploaderId: true },
      });
      if (!file) throw ApiError.badRequest('fileId does not refer to an existing upload');
      if (file.uploaderId !== args.ctx.userId && args.ctx.role !== Role.ADMIN) {
        throw ApiError.forbidden('You did not upload that file');
      }
      url = file.key; // store the S3 key; download URL is generated on access
      fileId = file.id;
      sizeBytes = file.sizeBytes;
      mimeType = file.mimeType;
    } else {
      url = args.input.url;
    }

    const created = await this.prisma.material.create({
      data: {
        lessonId: args.lessonId,
        courseId: args.courseId,
        title: args.input.title.trim(),
        type: args.input.type,
        url,
        fileId,
        sizeBytes,
        mimeType,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: args.ctx.userId,
        action: AuditAction.CREATE,
        entity: 'Material',
        entityId: created.id,
        metadata: {
          lessonId: args.lessonId,
          courseId: args.courseId,
          type: args.input.type,
          source: args.input.source,
        },
      },
    });
    return this.toDto(created);
  }

  private ensureCanManage(
    course: { id: string; teacherId: string },
    ctx: CourseAuthCtx,
  ): void {
    if (ctx.role !== Role.ADMIN && course.teacherId !== ctx.userId) {
      throw ApiError.forbidden('Not your course');
    }
  }

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
    if (!enrollment) throw ApiError.notFound('Course not found');
  }

  private toDto(row: {
    id: string;
    title: string;
    type: MaterialType;
    url: string;
    fileId: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: Date;
  }): MaterialDto {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      url: row.url,
      fileId: row.fileId,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDtos(rows: Array<Parameters<MaterialsService['toDto']>[0]>): MaterialDto[] {
    return rows.map((r) => this.toDto(r));
  }
}
