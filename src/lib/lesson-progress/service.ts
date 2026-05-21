import { EnrollmentStatus, type PrismaClient } from '@prisma/client';

import { ApiError } from '../api/errors';

export interface LessonProgressDto {
  lessonId: string;
  firstViewedAt: string;
  lastViewedAt: string;
  completedAt: string | null;
}

/** Enrollment states that may read course content and therefore track progress. */
const READABLE_ENROLLMENT: EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.COMPLETED,
];

interface ProgressRow {
  lessonId: string;
  firstViewedAt: Date;
  lastViewedAt: Date;
  completedAt: Date | null;
}

/**
 * Per-student lesson progress (Capa 13). Views are recorded automatically when
 * a student opens a lesson; completion is an explicit toggle. Every mutation
 * asserts the caller is an enrolled student of the lesson's course, so the rows
 * can be trusted as a real engagement signal for analytics.
 */
export class LessonProgressService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Resolve the lesson's course and assert the student may track progress. */
  private async assertEnrolled(lessonId: string, studentId: string): Promise<string> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw ApiError.notFound('Lesson not found');
    const courseId = lesson.module.courseId;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
      select: { status: true },
    });
    if (!enrollment || !READABLE_ENROLLMENT.includes(enrollment.status)) {
      throw ApiError.forbidden('No estás inscrito en este curso');
    }
    return courseId;
  }

  /** Record (or refresh) a view. Idempotent — bumps lastViewedAt on repeat. */
  async recordView(lessonId: string, studentId: string): Promise<LessonProgressDto> {
    await this.assertEnrolled(lessonId, studentId);
    const now = new Date();
    const row = await this.prisma.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      create: { lessonId, studentId, firstViewedAt: now, lastViewedAt: now },
      update: { lastViewedAt: now },
    });
    return toDto(row);
  }

  /** Mark the lesson complete / incomplete. Idempotent. */
  async setCompleted(
    lessonId: string,
    studentId: string,
    completed: boolean,
  ): Promise<LessonProgressDto> {
    await this.assertEnrolled(lessonId, studentId);
    const now = new Date();
    const completedAt = completed ? now : null;
    const row = await this.prisma.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      create: { lessonId, studentId, firstViewedAt: now, lastViewedAt: now, completedAt },
      update: { completedAt, lastViewedAt: now },
    });
    return toDto(row);
  }

  /** Progress for one student across a whole course, keyed by lessonId. */
  async mapForCourseStudent(
    courseId: string,
    studentId: string,
  ): Promise<Map<string, LessonProgressDto>> {
    const rows = await this.prisma.lessonProgress.findMany({
      where: { studentId, lesson: { module: { courseId } } },
    });
    return new Map(rows.map((r) => [r.lessonId, toDto(r)]));
  }
}

function toDto(r: ProgressRow): LessonProgressDto {
  return {
    lessonId: r.lessonId,
    firstViewedAt: r.firstViewedAt.toISOString(),
    lastViewedAt: r.lastViewedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}
