import {
  AuditAction,
  EnrollmentStatus,
  Prisma,
  QuestionType,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import { gradeQuestion, type AutogradeQuestion } from './autograder';
import type { SubmitAnswerInput } from './schemas';

export interface QuizAttemptDto {
  id: string;
  quizId: string;
  quizTitle: string;
  studentId: string;
  studentName: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  answers: Array<{
    id: string;
    questionId: string;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
    payload: unknown;
  }>;
  /// Server's clock — clients use this to render countdowns.
  serverNow: string;
  deadlineAt: string | null;
}

export class QuizAttemptsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- student flow ----------------------------------------------------

  /**
   * Start (or resume) a quiz attempt. If the student already has an in-flight
   * attempt (no submittedAt), it's returned as-is so refreshing the page
   * doesn't burn an attempt.
   */
  async start(quizId: string, ctx: CourseAuthCtx): Promise<QuizAttemptDto> {
    if (ctx.role !== Role.STUDENT) {
      throw ApiError.forbidden('Only students can take quizzes');
    }
    const quiz = await this.loadQuizWithCourse(quizId);
    if (!quiz.publishedAt) throw ApiError.notFound('Quiz not available');
    await this.ensureEnrolled(quiz.lesson.module.courseId, ctx);

    // In-flight?
    const inflight = await this.prisma.quizAttempt.findFirst({
      where: { quizId, studentId: ctx.userId, submittedAt: null },
      include: this.attemptInclude(),
    });
    if (inflight) return this.toDto(inflight, quiz);

    // Hit the per-quiz limit?
    const used = await this.prisma.quizAttempt.count({
      where: { quizId, studentId: ctx.userId, submittedAt: { not: null } },
    });
    if (used >= quiz.maxAttempts) {
      throw ApiError.badRequest(
        `You have used all ${quiz.maxAttempts} attempt(s) for this quiz`,
      );
    }

    const created = await this.prisma.quizAttempt.create({
      data: { quizId, studentId: ctx.userId },
      include: this.attemptInclude(),
    });
    return this.toDto(created, quiz);
  }

  /**
   * Save (or replace) one answer. Idempotent per (attempt, question) thanks
   * to the @@unique constraint and an upsert.
   * Auto-grading runs at finish() time, not here, so the student can change
   * their mind freely while the attempt is in flight.
   */
  async submitAnswer(
    attemptId: string,
    input: SubmitAnswerInput,
    ctx: CourseAuthCtx,
  ): Promise<void> {
    const attempt = await this.loadAttempt(attemptId);
    if (attempt.studentId !== ctx.userId) throw ApiError.forbidden('Not your attempt');
    if (attempt.submittedAt) throw ApiError.badRequest('Attempt is already submitted');
    this.assertDeadlineNotPassed(attempt);

    const question = attempt.quiz.questions.find((q) => q.id === input.questionId);
    if (!question) throw ApiError.badRequest('Question does not belong to this quiz');

    await this.prisma.quizAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId: input.questionId },
      },
      update: {
        payload: input.payload as Prisma.JsonObject,
        isCorrect: null,
        pointsAwarded: null,
      },
      create: {
        attemptId,
        questionId: input.questionId,
        payload: input.payload as Prisma.JsonObject,
      },
    });
  }

  /**
   * Finalise the attempt: auto-grade every answer, compute score + maxScore,
   * write submittedAt. Manual-grading questions (LONG_ANSWER, SHORT_ANSWER
   * without an expectedAnswer) end up with pointsAwarded = null and DO NOT
   * contribute to the auto-score; the teacher fixes that with
   * /api/quiz-attempts/:id/grade later.
   */
  async finish(attemptId: string, ctx: CourseAuthCtx): Promise<QuizAttemptDto> {
    const attempt = await this.loadAttempt(attemptId);
    if (attempt.studentId !== ctx.userId) throw ApiError.forbidden('Not your attempt');
    if (attempt.submittedAt) {
      // Idempotent.
      return this.toDto(attempt, attempt.quiz);
    }

    const maxScore = attempt.quiz.questions.reduce((acc, q) => acc + q.points, 0);
    let autoScore = 0;
    const answerUpdates: Array<{ id: string; isCorrect: boolean | null; pointsAwarded: number | null }> = [];

    for (const question of attempt.quiz.questions) {
      const answer = attempt.answers.find((a) => a.questionId === question.id);
      if (!answer) continue; // unanswered → 0, no row to update
      const aq: AutogradeQuestion = {
        id: question.id,
        type: question.type as QuestionType,
        points: question.points,
        expectedAnswer: question.expectedAnswer,
        options: question.options.map((o) => ({
          id: o.id,
          isCorrect: o.isCorrect,
          text: o.text,
        })),
      };
      const result = gradeQuestion(aq, answer.payload);
      if (result.pointsAwarded != null) autoScore += result.pointsAwarded;
      answerUpdates.push({ id: answer.id, ...result });
    }

    const submittedAt = new Date();
    await this.prisma.$transaction([
      ...answerUpdates.map((u) =>
        this.prisma.quizAnswer.update({
          where: { id: u.id },
          data: { isCorrect: u.isCorrect, pointsAwarded: u.pointsAwarded },
        }),
      ),
      this.prisma.quizAttempt.update({
        where: { id: attemptId },
        data: { submittedAt, score: autoScore, maxScore },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.UPDATE,
          entity: 'QuizAttempt',
          entityId: attemptId,
          metadata: { event: 'finished', autoScore, maxScore },
        },
      }),
    ]);

    const fresh = await this.prisma.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: this.attemptInclude(),
    });
    return this.toDto(fresh, attempt.quiz);
  }

  // ---- read ------------------------------------------------------------

  async getById(attemptId: string, ctx: CourseAuthCtx): Promise<QuizAttemptDto> {
    const attempt = await this.loadAttempt(attemptId);
    const isStudent = attempt.studentId === ctx.userId;
    const isManager =
      ctx.role === Role.ADMIN || attempt.quiz.lesson.module.course.teacherId === ctx.userId;
    if (!isStudent && !isManager) throw ApiError.forbidden('Not your attempt');
    return this.toDto(attempt, attempt.quiz);
  }

  async listForQuiz(quizId: string, ctx: CourseAuthCtx): Promise<QuizAttemptDto[]> {
    const quiz = await this.loadQuizWithCourse(quizId);
    if (
      ctx.role !== Role.ADMIN &&
      quiz.lesson.module.course.teacherId !== ctx.userId
    ) {
      throw ApiError.forbidden('Not your course');
    }
    const rows = await this.prisma.quizAttempt.findMany({
      where: { quizId },
      include: this.attemptInclude(),
      orderBy: [{ submittedAt: 'asc' }, { startedAt: 'asc' }],
    });
    return rows.map((r) => this.toDto(r, quiz));
  }

  // ---- helpers ---------------------------------------------------------

  private async loadQuizWithCourse(quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        lesson: { include: { module: { include: { course: true } } } },
        questions: {
          orderBy: { position: 'asc' },
          include: { options: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!quiz || quiz.lesson.module.course.deletedAt) throw ApiError.notFound('Quiz not found');
    return quiz;
  }

  private async loadAttempt(attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        ...this.attemptInclude(),
        quiz: {
          include: {
            lesson: { include: { module: { include: { course: true } } } },
            questions: {
              orderBy: { position: 'asc' },
              include: { options: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    return attempt;
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
    if (!enr) throw ApiError.forbidden('Not enrolled in this course');
  }

  private assertDeadlineNotPassed(attempt: {
    startedAt: Date;
    quiz: { timeLimitMin: number | null };
  }): void {
    if (!attempt.quiz.timeLimitMin) return;
    const deadlineMs =
      attempt.startedAt.getTime() + attempt.quiz.timeLimitMin * 60_000;
    if (Date.now() > deadlineMs) {
      throw ApiError.badRequest('Quiz time limit exceeded; submit the attempt to finalize');
    }
  }

  private attemptInclude() {
    return {
      student: { select: { id: true, fullName: true } },
      answers: true,
      quiz: { select: { title: true, timeLimitMin: true } },
    } satisfies Prisma.QuizAttemptInclude;
  }

  private toDto(
    attempt: {
      id: string;
      quizId: string;
      studentId: string;
      student: { fullName: string } | null;
      startedAt: Date;
      submittedAt: Date | null;
      score: number | null;
      maxScore: number | null;
      answers: Array<{
        id: string;
        questionId: string;
        isCorrect: boolean | null;
        pointsAwarded: number | null;
        payload: Prisma.JsonValue;
      }>;
    },
    quiz: { title: string; timeLimitMin: number | null },
  ): QuizAttemptDto {
    const deadlineAt = quiz.timeLimitMin
      ? new Date(attempt.startedAt.getTime() + quiz.timeLimitMin * 60_000).toISOString()
      : null;
    return {
      id: attempt.id,
      quizId: attempt.quizId,
      quizTitle: quiz.title,
      studentId: attempt.studentId,
      studentName: attempt.student?.fullName ?? '',
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      score: attempt.score,
      maxScore: attempt.maxScore,
      answers: attempt.answers.map((a) => ({
        id: a.id,
        questionId: a.questionId,
        isCorrect: a.isCorrect,
        pointsAwarded: a.pointsAwarded,
        payload: a.payload,
      })),
      serverNow: new Date().toISOString(),
      deadlineAt,
    };
  }
}
