import {
  AuditAction,
  EnrollmentStatus,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import type { UpsertReviewInput } from './schemas';

export interface TeacherReviewDto {
  id: string;
  teacherId: string;
  authorId: string;
  authorName: string;
  courseId: string | null;
  courseTitle: string | null;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherRatingSummary {
  teacherId: string;
  ratingAvg: number;
  ratingCount: number;
  reviews: TeacherReviewDto[];
}

export class TeacherReviewsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Upsert a review. The author MUST be enrolled (or have been enrolled) in
   * at least one of the teacher's courses — anonymous "drive-by" reviews
   * are not allowed. Unique per (teacher, author, course).
   */
  async upsert(
    teacherId: string,
    input: UpsertReviewInput,
    ctx: CourseAuthCtx,
  ): Promise<TeacherReviewDto> {
    if (ctx.userId === teacherId) throw ApiError.badRequest('Cannot review yourself');

    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!teacher || teacher.deletedAt || teacher.role !== Role.TEACHER) {
      throw ApiError.notFound('Teacher not found');
    }

    await this.ensureEligibleReviewer(teacherId, input.courseId ?? null, ctx);

    const upserted = await this.prisma.teacherReview.upsert({
      where: {
        teacherId_authorId_courseId: {
          teacherId,
          authorId: ctx.userId,
          courseId: input.courseId ?? null,
        },
      },
      update: {
        rating: input.rating,
        comment: input.comment?.trim() ?? null,
      },
      create: {
        teacherId,
        authorId: ctx.userId,
        courseId: input.courseId ?? null,
        rating: input.rating,
        comment: input.comment?.trim() ?? null,
      },
      include: {
        author: { select: { id: true, fullName: true } },
        course: { select: { id: true, title: true } },
      },
    });

    await this.refreshDenormalizedRating(teacherId);
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.UPDATE,
        entity: 'TeacherReview',
        entityId: upserted.id,
        metadata: { teacherId, rating: input.rating },
      },
    });
    return this.toDto(upserted);
  }

  async listForTeacher(teacherId: string): Promise<TeacherRatingSummary> {
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: { id: true, role: true, teacherProfile: { select: { ratingAvg: true, ratingCount: true } } },
    });
    if (!teacher || teacher.role !== Role.TEACHER) throw ApiError.notFound('Teacher not found');

    const rows = await this.prisma.teacherReview.findMany({
      where: { teacherId },
      include: {
        author: { select: { id: true, fullName: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      teacherId,
      ratingAvg: teacher.teacherProfile?.ratingAvg ?? 0,
      ratingCount: teacher.teacherProfile?.ratingCount ?? 0,
      reviews: rows.map((r) => this.toDto(r)),
    };
  }

  async remove(reviewId: string, ctx: CourseAuthCtx): Promise<void> {
    const review = await this.prisma.teacherReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw ApiError.notFound('Review not found');
    if (ctx.role !== Role.ADMIN && review.authorId !== ctx.userId) {
      throw ApiError.forbidden('You did not write this review');
    }
    await this.prisma.teacherReview.delete({ where: { id: reviewId } });
    await this.refreshDenormalizedRating(review.teacherId);
  }

  // ---- helpers ---------------------------------------------------------

  /**
   * A review is allowed when the author:
   *   - is STUDENT or PARENT (admins/teachers don't review),
   *   - has at least one enrollment ACTIVE/COMPLETED in a course owned by
   *     this teacher (or specifically in `courseId` when one is bound).
   */
  private async ensureEligibleReviewer(
    teacherId: string,
    courseId: string | null,
    ctx: CourseAuthCtx,
  ): Promise<void> {
    if (ctx.role !== Role.STUDENT && ctx.role !== Role.PARENT) {
      throw ApiError.forbidden('Only students and parents can write reviews');
    }
    if (courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { teacherId: true },
      });
      if (!course) throw ApiError.badRequest('Course not found');
      if (course.teacherId !== teacherId) {
        throw ApiError.badRequest('Course does not belong to that teacher');
      }
    }

    // Parents act on behalf of their kids — they can review if any linked
    // child is enrolled in the teacher's course. For STUDENT, themselves.
    const studentIds: string[] = ctx.role === Role.STUDENT ? [ctx.userId] : await this.linkedChildIds(ctx.userId);
    if (studentIds.length === 0) {
      throw ApiError.forbidden('No linked student to qualify this review');
    }
    const enrolled = await this.prisma.enrollment.findFirst({
      where: {
        studentId: { in: studentIds },
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
        course: {
          teacherId,
          ...(courseId ? { id: courseId } : {}),
        },
      },
      select: { id: true },
    });
    if (!enrolled) {
      throw ApiError.forbidden('You can only review teachers whose courses you (or your child) attended');
    }
  }

  private async linkedChildIds(parentId: string): Promise<string[]> {
    const links = await this.prisma.parentChildLink.findMany({
      where: { parentId, status: 'APPROVED' },
      select: { childId: true },
    });
    return links.map((l) => l.childId);
  }

  /**
   * Recompute the teacher's denormalised rating aggregate. Cheap (one
   * GROUP BY) and run after every review insert/update/delete so the
   * teacher card on the course page is always consistent.
   */
  private async refreshDenormalizedRating(teacherId: string): Promise<void> {
    const agg = await this.prisma.teacherReview.aggregate({
      where: { teacherId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await this.prisma.teacherProfile.upsert({
      where: { userId: teacherId },
      update: {
        ratingAvg: agg._avg.rating ?? 0,
        ratingCount: agg._count._all,
      },
      create: {
        userId: teacherId,
        ratingAvg: agg._avg.rating ?? 0,
        ratingCount: agg._count._all,
      },
    });
  }

  private toDto(row: {
    id: string;
    teacherId: string;
    authorId: string;
    author: { id: string; fullName: string };
    courseId: string | null;
    course: { id: string; title: string } | null;
    rating: number;
    comment: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): TeacherReviewDto {
    return {
      id: row.id,
      teacherId: row.teacherId,
      authorId: row.authorId,
      authorName: row.author.fullName,
      courseId: row.courseId,
      courseTitle: row.course?.title ?? null,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
