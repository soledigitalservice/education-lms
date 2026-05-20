import {
  AuditAction,
  GradeScale,
  NotificationKind,
  Prisma,
  Role,
  SubmissionStatus,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import { NotificationsService } from '../notifications/service';
import type { UpsertGradeInput } from './schemas';

export interface GradeDto {
  id: string;
  studentId: string;
  studentName: string;
  graderId: string;
  graderName: string;
  scale: GradeScale;
  numericValue: number | null;
  conceptValue: string | null;
  letterValue: string | null;
  feedback: string | null;
  gradedAt: string;
  source:
    | { kind: 'submission'; submissionId: string; assignmentId: string; assignmentTitle: string }
    | { kind: 'quiz'; quizAttemptId: string; quizId: string; quizTitle: string };
  courseId: string;
  courseTitle: string;
}

export class GradesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- teacher writes --------------------------------------------------

  /** Grade (or re-grade) a submission. */
  async upsertForSubmission(
    submissionId: string,
    input: UpsertGradeInput,
    ctx: CourseAuthCtx,
  ): Promise<GradeDto> {
    const sub = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: { course: { select: { id: true, teacherId: true, deletedAt: true } } },
        },
      },
    });
    if (!sub || sub.assignment.course.deletedAt) {
      throw ApiError.notFound('Submission not found');
    }
    this.ensureCanManage(sub.assignment.course, ctx);
    if (sub.status === SubmissionStatus.DRAFT) {
      throw ApiError.badRequest('Cannot grade a DRAFT submission');
    }

    this.validateValueForScale(input, sub.assignment.maxScore);

    const data = this.buildGradeData(input, ctx.userId);
    const upserted = await this.prisma.grade.upsert({
      where: { submissionId },
      update: data,
      create: {
        ...data,
        studentId: sub.studentId,
        submissionId,
      },
    });

    // Flip the submission to GRADED so the student sees the feedback.
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.GRADED },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.CREATE,
        entity: 'Grade',
        entityId: upserted.id,
        metadata: { submissionId, scale: input.scale },
      },
    });

    // Notify the student that their submission has been graded.
    const full = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        assignment: {
          select: { title: true, lessonId: true, course: { select: { slug: true } } },
        },
      },
    });
    if (full) {
      const link = full.assignment.lessonId
        ? `/courses/${full.assignment.course.slug}/lessons/${full.assignment.lessonId}`
        : `/courses/${full.assignment.course.slug}`;
      void new NotificationsService(this.prisma).dispatch({
        userId: sub.studentId,
        kind: NotificationKind.ASSIGNMENT_GRADED,
        title: full.assignment.title,
        body: `Tu tarea "${full.assignment.title}" ha sido calificada. Mira el feedback del profesor.`,
        link,
      });
    }

    return this.getById(upserted.id, ctx);
  }

  /** Grade (or re-grade) a quiz attempt — used for manual scoring of LONG_ANSWER. */
  async upsertForQuizAttempt(
    attemptId: string,
    input: UpsertGradeInput,
    ctx: CourseAuthCtx,
  ): Promise<GradeDto> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            lesson: {
              include: {
                module: { select: { course: { select: { id: true, teacherId: true, deletedAt: true } } } },
              },
            },
          },
        },
      },
    });
    if (!attempt || attempt.quiz.lesson.module.course.deletedAt) {
      throw ApiError.notFound('Quiz attempt not found');
    }
    this.ensureCanManage(attempt.quiz.lesson.module.course, ctx);
    if (!attempt.submittedAt) {
      throw ApiError.badRequest('Cannot grade an attempt the student has not submitted yet');
    }
    if (input.scale === GradeScale.NUMERIC && attempt.maxScore != null) {
      this.validateValueForScale(input, attempt.maxScore);
    }

    const data = this.buildGradeData(input, ctx.userId);
    const upserted = await this.prisma.grade.upsert({
      where: { quizAttemptId: attemptId },
      update: data,
      create: {
        ...data,
        studentId: attempt.studentId,
        quizAttemptId: attemptId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.CREATE,
        entity: 'Grade',
        entityId: upserted.id,
        metadata: { quizAttemptId: attemptId, scale: input.scale },
      },
    });
    return this.getById(upserted.id, ctx);
  }

  // ---- reads -----------------------------------------------------------

  async getById(gradeId: string, ctx: CourseAuthCtx): Promise<GradeDto> {
    const g = await this.prisma.grade.findUnique({
      where: { id: gradeId },
      include: this.fullInclude(),
    });
    if (!g) throw ApiError.notFound('Grade not found');
    this.ensureCanRead(g, ctx);
    return this.toDto(g);
  }

  async listForStudent(studentId: string, ctx: CourseAuthCtx): Promise<GradeDto[]> {
    // Access rules:
    //   - ADMIN can read anyone's grades.
    //   - The student themselves can read their own.
    //   - PARENT can read if they have an APPROVED ParentChildLink to the student.
    //   - Teachers don't go through this path — they use `listForCourse`.
    if (ctx.role !== Role.ADMIN && studentId !== ctx.userId) {
      if (ctx.role === Role.PARENT) {
        const link = await this.prisma.parentChildLink.findUnique({
          where: { parentId_childId: { parentId: ctx.userId, childId: studentId } },
          select: { status: true },
        });
        if (!link || link.status !== 'APPROVED') {
          throw ApiError.forbidden('No approved link to that student');
        }
      } else {
        throw ApiError.forbidden('Not your grades');
      }
    }
    const rows = await this.prisma.grade.findMany({
      where: { studentId },
      include: this.fullInclude(),
      orderBy: { gradedAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async listForCourse(courseId: string, ctx: CourseAuthCtx): Promise<GradeDto[]> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    this.ensureCanManage(course, ctx);

    const rows = await this.prisma.grade.findMany({
      where: {
        OR: [
          { submission: { assignment: { courseId } } },
          { quizAttempt: { quiz: { lesson: { module: { courseId } } } } },
        ],
      },
      include: this.fullInclude(),
      orderBy: { gradedAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  // ---- helpers ---------------------------------------------------------

  private validateValueForScale(input: UpsertGradeInput, maxScore: number): void {
    if (input.scale === GradeScale.NUMERIC) {
      if (input.numericValue > maxScore) {
        throw ApiError.badRequest(
          `numericValue (${input.numericValue}) exceeds maxScore (${maxScore})`,
        );
      }
    }
  }

  private buildGradeData(input: UpsertGradeInput, graderId: string) {
    const base = {
      graderId,
      gradedAt: new Date(),
      scale: input.scale,
      feedback: input.feedback ?? null,
      numericValue: null as number | null,
      conceptValue: null as string | null,
      letterValue: null as string | null,
    };
    switch (input.scale) {
      case GradeScale.NUMERIC:
        base.numericValue = input.numericValue;
        break;
      case GradeScale.CONCEPT:
        base.conceptValue = input.conceptValue;
        break;
      case GradeScale.LETTER:
        base.letterValue = input.letterValue;
        break;
    }
    return base;
  }

  private ensureCanRead(
    grade: { studentId: string; submission: { assignment: { course: { teacherId: string } } } | null; quizAttempt: { quiz: { lesson: { module: { course: { teacherId: string } } } } } | null },
    ctx: CourseAuthCtx,
  ): void {
    if (ctx.role === Role.ADMIN) return;
    if (grade.studentId === ctx.userId) return;
    const teacherId =
      grade.submission?.assignment.course.teacherId ??
      grade.quizAttempt?.quiz.lesson.module.course.teacherId;
    if (teacherId === ctx.userId) return;
    throw ApiError.forbidden('Cannot read this grade');
  }

  private ensureCanManage(
    course: { id: string; teacherId: string },
    ctx: CourseAuthCtx,
  ): void {
    if (ctx.role !== Role.ADMIN && course.teacherId !== ctx.userId) {
      throw ApiError.forbidden('Not your course');
    }
  }

  private fullInclude() {
    return {
      student: { select: { id: true, fullName: true } },
      grader: { select: { id: true, fullName: true } },
      submission: {
        include: {
          assignment: {
            include: {
              course: { select: { id: true, title: true, teacherId: true } },
            },
          },
        },
      },
      quizAttempt: {
        include: {
          quiz: {
            include: {
              lesson: {
                include: {
                  module: {
                    include: {
                      course: { select: { id: true, title: true, teacherId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.GradeInclude;
  }

  private toDto(row: Prisma.GradeGetPayload<{ include: ReturnType<GradesService['fullInclude']> }>): GradeDto {
    const sub = row.submission;
    const att = row.quizAttempt;
    const source: GradeDto['source'] = sub
      ? {
          kind: 'submission',
          submissionId: sub.id,
          assignmentId: sub.assignmentId,
          assignmentTitle: sub.assignment.title,
        }
      : att
        ? {
            kind: 'quiz',
            quizAttemptId: att.id,
            quizId: att.quizId,
            quizTitle: att.quiz.title,
          }
        : {
            // Should never happen — Grade has a CHECK-like constraint via unique indexes
            // on submissionId and quizAttemptId. Throw loudly if it does.
            kind: 'submission',
            submissionId: '',
            assignmentId: '',
            assignmentTitle: '(orphan grade)',
          };
    const course = sub?.assignment.course ?? att!.quiz.lesson.module.course;
    return {
      id: row.id,
      studentId: row.studentId,
      studentName: row.student.fullName,
      graderId: row.graderId,
      graderName: row.grader.fullName,
      scale: row.scale,
      numericValue: row.numericValue,
      conceptValue: row.conceptValue,
      letterValue: row.letterValue,
      feedback: row.feedback,
      gradedAt: row.gradedAt.toISOString(),
      source,
      courseId: course.id,
      courseTitle: course.title,
    };
  }
}
