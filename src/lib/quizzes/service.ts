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
import type {
  CreateQuestionInput,
  CreateQuizInput,
  ReorderQuestionInput,
  UpdateQuestionInput,
  UpdateQuizInput,
} from './schemas';

export interface QuestionOptionDto {
  id: string;
  text: string;
  position: number;
  /// Hidden from students — only included for the teacher view.
  isCorrect?: boolean;
}

export interface QuestionDto {
  id: string;
  quizId: string;
  position: number;
  prompt: string;
  type: QuestionType;
  points: number;
  /// Hidden from students.
  expectedAnswer?: string | null;
  options: QuestionOptionDto[];
}

export interface QuizDto {
  id: string;
  lessonId: string;
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  maxAttempts: number;
  shuffle: boolean;
  publishedAt: string | null;
  totalPoints: number;
  questionCount: number;
  questions?: QuestionDto[];
}

export class QuizzesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- quiz CRUD -------------------------------------------------------

  async createForLesson(
    lessonId: string,
    input: CreateQuizInput,
    ctx: CourseAuthCtx,
  ): Promise<QuizDto> {
    const lesson = await this.loadLessonWithCourse(lessonId);
    this.ensureCanManage(lesson.module.course, ctx);
    const existing = await this.prisma.quiz.findUnique({ where: { lessonId } });
    if (existing) throw ApiError.conflict('That lesson already has a quiz');

    const created = await this.prisma.quiz.create({
      data: {
        lessonId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        timeLimitMin: input.timeLimitMin ?? null,
        maxAttempts: input.maxAttempts,
        shuffle: input.shuffle,
      },
      include: { _count: { select: { questions: true } } },
    });
    await this.audit(ctx.userId, AuditAction.CREATE, created.id, { lessonId });
    return this.toDto({ ...created, totalPoints: 0 });
  }

  async update(quizId: string, input: UpdateQuizInput, ctx: CourseAuthCtx): Promise<QuizDto> {
    const q = await this.loadQuizWithCourse(quizId);
    this.ensureCanManage(q.lesson.module.course, ctx);
    const updated = await this.prisma.quiz.update({
      where: { id: quizId },
      data: {
        title: input.title?.trim() ?? q.title,
        description:
          input.description !== undefined ? input.description?.trim() ?? null : q.description,
        timeLimitMin: input.timeLimitMin !== undefined ? input.timeLimitMin : q.timeLimitMin,
        maxAttempts: input.maxAttempts ?? q.maxAttempts,
        shuffle: input.shuffle ?? q.shuffle,
        publishedAt: input.publishedAt !== undefined ? input.publishedAt : q.publishedAt,
      },
      include: { _count: { select: { questions: true } } },
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, quizId, {});
    return this.toDto({ ...updated, totalPoints: await this.computeTotalPoints(quizId) });
  }

  async remove(quizId: string, ctx: CourseAuthCtx): Promise<void> {
    const q = await this.loadQuizWithCourse(quizId);
    this.ensureCanManage(q.lesson.module.course, ctx);
    await this.prisma.$transaction([
      this.prisma.quiz.delete({ where: { id: quizId } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'Quiz',
          entityId: quizId,
        },
      }),
    ]);
  }

  async getForLesson(lessonId: string, ctx: CourseAuthCtx): Promise<QuizDto | null> {
    const lesson = await this.loadLessonWithCourse(lessonId);
    const isManager = ctx.role === Role.ADMIN || lesson.module.course.teacherId === ctx.userId;
    if (!isManager) await this.ensureEnrolled(lesson.module.courseId, ctx);

    const quiz = await this.prisma.quiz.findUnique({
      where: { lessonId },
      include: {
        _count: { select: { questions: true } },
        questions: {
          orderBy: { position: 'asc' },
          include: { options: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!quiz) return null;
    if (!quiz.publishedAt && !isManager) return null;

    const totalPoints = quiz.questions.reduce((acc, q) => acc + q.points, 0);
    return this.toDto({ ...quiz, totalPoints }, isManager);
  }

  // ---- questions -------------------------------------------------------

  async addQuestion(
    quizId: string,
    input: CreateQuestionInput,
    ctx: CourseAuthCtx,
  ): Promise<QuestionDto> {
    const q = await this.loadQuizWithCourse(quizId);
    this.ensureCanManage(q.lesson.module.course, ctx);
    if (q.publishedAt) {
      throw ApiError.badRequest(
        'Cannot edit questions on a published quiz. Unpublish first.',
      );
    }

    this.validateQuestionShape(input);
    const lastPos = await this.prisma.question.findFirst({
      where: { quizId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (lastPos?.position ?? 0) + 1;

    const created = await this.prisma.question.create({
      data: {
        quizId,
        position,
        prompt: input.prompt.trim(),
        type: input.type,
        points: input.points,
        expectedAnswer:
          input.type === QuestionType.SHORT_ANSWER ? input.expectedAnswer.trim() : null,
        options: this.buildOptions(input),
      },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    return this.toQuestionDto(created, true);
  }

  async updateQuestion(
    questionId: string,
    input: UpdateQuestionInput,
    ctx: CourseAuthCtx,
  ): Promise<QuestionDto> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        quiz: { include: { lesson: { include: { module: { include: { course: true } } } } } },
        options: { orderBy: { position: 'asc' } },
      },
    });
    if (!question) throw ApiError.notFound('Question not found');
    this.ensureCanManage(question.quiz.lesson.module.course, ctx);
    if (question.quiz.publishedAt) {
      throw ApiError.badRequest('Cannot edit questions on a published quiz. Unpublish first.');
    }

    // Only allow editing fields that don't change the option shape (which would invalidate
    // existing answers). Options CRUD is its own endpoint.
    const updated = await this.prisma.question.update({
      where: { id: questionId },
      data: {
        prompt: input.prompt?.trim() ?? question.prompt,
        points: input.points ?? question.points,
        expectedAnswer:
          input.expectedAnswer !== undefined
            ? input.expectedAnswer?.trim() ?? null
            : question.expectedAnswer,
      },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    return this.toQuestionDto(updated, true);
  }

  async removeQuestion(questionId: string, ctx: CourseAuthCtx): Promise<void> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        quiz: { include: { lesson: { include: { module: { include: { course: true } } } } } },
      },
    });
    if (!question) throw ApiError.notFound('Question not found');
    this.ensureCanManage(question.quiz.lesson.module.course, ctx);
    if (question.quiz.publishedAt) {
      throw ApiError.badRequest('Cannot delete questions on a published quiz. Unpublish first.');
    }

    await this.prisma.$transaction([
      this.prisma.question.delete({ where: { id: questionId } }),
      this.prisma.$executeRaw`
        UPDATE "Question"
        SET "position" = "position" - 1
        WHERE "quizId" = ${question.quizId} AND "position" > ${question.position}
      `,
    ]);
  }

  async reorderQuestion(
    questionId: string,
    input: ReorderQuestionInput,
    ctx: CourseAuthCtx,
  ): Promise<void> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        quiz: { include: { lesson: { include: { module: { include: { course: true } } } } } },
      },
    });
    if (!question) throw ApiError.notFound('Question not found');
    this.ensureCanManage(question.quiz.lesson.module.course, ctx);

    const neighbour = await this.prisma.question.findFirst({
      where: {
        quizId: question.quizId,
        position: input.direction === 'up' ? { lt: question.position } : { gt: question.position },
      },
      orderBy: { position: input.direction === 'up' ? 'desc' : 'asc' },
    });
    if (!neighbour) return; // no-op at edge

    const temp = -question.position - 1;
    await this.prisma.$transaction([
      this.prisma.question.update({ where: { id: question.id }, data: { position: temp } }),
      this.prisma.question.update({
        where: { id: neighbour.id },
        data: { position: question.position },
      }),
      this.prisma.question.update({
        where: { id: question.id },
        data: { position: neighbour.position },
      }),
    ]);
  }

  // ---- helpers ---------------------------------------------------------

  private validateQuestionShape(input: CreateQuestionInput): void {
    if (input.type === QuestionType.SINGLE_CHOICE) {
      const correct = input.options.filter((o) => o.isCorrect).length;
      if (correct !== 1) {
        throw ApiError.badRequest('SINGLE_CHOICE must have exactly one correct option');
      }
    }
    if (input.type === QuestionType.MULTIPLE_CHOICE) {
      const correct = input.options.filter((o) => o.isCorrect).length;
      if (correct < 1) {
        throw ApiError.badRequest('MULTIPLE_CHOICE must have at least one correct option');
      }
    }
  }

  private buildOptions(input: CreateQuestionInput): Prisma.QuestionOptionUncheckedCreateNestedManyWithoutQuestionInput | undefined {
    switch (input.type) {
      case QuestionType.SINGLE_CHOICE:
      case QuestionType.MULTIPLE_CHOICE:
        return {
          create: input.options.map((o, i) => ({
            text: o.text.trim(),
            isCorrect: o.isCorrect,
            position: i + 1,
          })),
        };
      case QuestionType.TRUE_FALSE:
        return {
          create: [
            { text: 'True', isCorrect: input.correct === true, position: 1 },
            { text: 'False', isCorrect: input.correct === false, position: 2 },
          ],
        };
      case QuestionType.SHORT_ANSWER:
      case QuestionType.LONG_ANSWER:
        return undefined;
    }
  }

  private async loadLessonWithCourse(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: { select: { id: true, teacherId: true, deletedAt: true } } } } },
    });
    if (!lesson || lesson.module.course.deletedAt) throw ApiError.notFound('Lesson not found');
    return lesson;
  }

  private async loadQuizWithCourse(quizId: string) {
    const q = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { lesson: { include: { module: { include: { course: true } } } } },
    });
    if (!q || q.lesson.module.course.deletedAt) throw ApiError.notFound('Quiz not found');
    return q;
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

  private async computeTotalPoints(quizId: string): Promise<number> {
    const result = await this.prisma.question.aggregate({
      where: { quizId },
      _sum: { points: true },
    });
    return result._sum.points ?? 0;
  }

  private audit(
    actorId: string,
    action: AuditAction,
    entityId: string,
    metadata: Prisma.JsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entity: 'Quiz', entityId, metadata: metadata ?? undefined },
    });
  }

  private toDto(
    row: {
      id: string;
      lessonId: string;
      title: string;
      description: string | null;
      timeLimitMin: number | null;
      maxAttempts: number;
      shuffle: boolean;
      publishedAt: Date | null;
      totalPoints: number;
      _count: { questions: number };
      questions?: Array<{
        id: string;
        quizId: string;
        position: number;
        prompt: string;
        type: QuestionType;
        points: number;
        expectedAnswer: string | null;
        options: Array<{ id: string; text: string; isCorrect: boolean; position: number }>;
      }>;
    },
    forManager = false,
  ): QuizDto {
    return {
      id: row.id,
      lessonId: row.lessonId,
      title: row.title,
      description: row.description,
      timeLimitMin: row.timeLimitMin,
      maxAttempts: row.maxAttempts,
      shuffle: row.shuffle,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      totalPoints: row.totalPoints,
      questionCount: row._count.questions,
      questions: row.questions?.map((q) => this.toQuestionDto(q, forManager)),
    };
  }

  private toQuestionDto(
    row: {
      id: string;
      quizId: string;
      position: number;
      prompt: string;
      type: QuestionType;
      points: number;
      expectedAnswer: string | null;
      options: Array<{ id: string; text: string; isCorrect: boolean; position: number }>;
    },
    forManager: boolean,
  ): QuestionDto {
    return {
      id: row.id,
      quizId: row.quizId,
      position: row.position,
      prompt: row.prompt,
      type: row.type,
      points: row.points,
      expectedAnswer: forManager ? row.expectedAnswer : undefined,
      options: row.options.map((o) => ({
        id: o.id,
        text: o.text,
        position: o.position,
        ...(forManager ? { isCorrect: o.isCorrect } : {}),
      })),
    };
  }
}
