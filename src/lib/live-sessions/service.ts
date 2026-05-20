import {
  AuditAction,
  EnrollmentStatus,
  LessonType,
  LiveSessionStatus,
  Prisma,
  Role,
  type PrismaClient,
} from '@prisma/client';
import { nanoid } from 'nanoid';

import { ApiError } from '../api/errors';
import { isLiveKitConfigured } from '../env';
import { buildAccessToken } from '../livekit/tokens';
import { getPublicSignalUrl } from '../livekit/client';
import type { CourseAuthCtx } from '../courses/service';
import type { CreateLiveSessionInput, UpdateLiveSessionInput } from './schemas';

export interface LiveSessionDto {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string | null;
  host: { id: string; fullName: string };
  status: LiveSessionStatus;
  roomName: string;
  roomActive: boolean;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  allowChat: boolean;
  allowScreenShare: boolean;
  recordOnStart: boolean;
  recordingsCount: number;
}

export interface JoinTokenDto {
  /** LiveKit JWT for the client to pass to <LiveKitRoom token={...} />. */
  token: string;
  /** Public signal URL (ws/wss) for the client. */
  url: string;
  roomName: string;
  isHost: boolean;
}

export class LiveSessionsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- read ------------------------------------------------------------

  async listForCourse(courseId: string, ctx: CourseAuthCtx): Promise<LiveSessionDto[]> {
    const course = await this.loadCourse(courseId);
    const isManager = ctx.role === Role.ADMIN || course.teacherId === ctx.userId;
    if (!isManager) await this.ensureEnrolled(courseId, ctx);
    const rows = await this.prisma.liveSession.findMany({
      where: { courseId },
      include: this.fullInclude(),
      orderBy: { scheduledStart: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async getById(sessionId: string, ctx: CourseAuthCtx): Promise<LiveSessionDto> {
    const row = await this.loadOrThrow(sessionId);
    await this.ensureCanRead(row.course, ctx);
    return this.toDto(row);
  }

  // ---- mutations -------------------------------------------------------

  async create(
    courseId: string,
    input: CreateLiveSessionInput,
    ctx: CourseAuthCtx,
  ): Promise<LiveSessionDto> {
    const course = await this.loadCourse(courseId);
    this.ensureCanManage(course, ctx);
    if (input.scheduledEnd <= input.scheduledStart) {
      throw ApiError.badRequest('scheduledEnd must be after scheduledStart');
    }
    if (input.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        include: { module: { select: { courseId: true } }, liveSession: true },
      });
      if (!lesson) throw ApiError.badRequest('lessonId does not exist');
      if (lesson.module.courseId !== courseId) {
        throw ApiError.badRequest('lessonId belongs to a different course');
      }
      if (lesson.type !== LessonType.LIVE_CLASS) {
        throw ApiError.badRequest('Lesson must be of type LIVE_CLASS to bind a session to it');
      }
      if (lesson.liveSession) {
        throw ApiError.conflict('That lesson already has a live session');
      }
    }

    // Room names: 24 random chars prefixed with course id slice for human
    // recognisability in the LiveKit dashboard. Unique by construction.
    const roomName = `c${courseId.slice(-6)}-${nanoid(18)}`.toLowerCase();

    const created = await this.prisma.liveSession.create({
      data: {
        courseId,
        lessonId: input.lessonId ?? null,
        hostId: ctx.userId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        roomName,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        allowChat: input.allowChat,
        allowScreenShare: input.allowScreenShare,
        recordOnStart: input.recordOnStart,
      },
      include: this.fullInclude(),
    });
    await this.audit(ctx.userId, AuditAction.CREATE, created.id, {
      courseId,
      lessonId: input.lessonId ?? null,
    });
    return this.toDto(created);
  }

  async update(
    sessionId: string,
    input: UpdateLiveSessionInput,
    ctx: CourseAuthCtx,
  ): Promise<LiveSessionDto> {
    const row = await this.loadOrThrow(sessionId);
    this.ensureCanManage(row.course, ctx);
    if (row.status !== LiveSessionStatus.SCHEDULED) {
      throw ApiError.badRequest(`Cannot edit a session in ${row.status} state`);
    }
    if (
      input.scheduledStart &&
      input.scheduledEnd &&
      input.scheduledEnd <= input.scheduledStart
    ) {
      throw ApiError.badRequest('scheduledEnd must be after scheduledStart');
    }
    const updated = await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        title: input.title?.trim() ?? row.title,
        description:
          input.description !== undefined ? input.description?.trim() ?? null : row.description,
        scheduledStart: input.scheduledStart ?? row.scheduledStart,
        scheduledEnd: input.scheduledEnd ?? row.scheduledEnd,
        allowChat: input.allowChat ?? row.allowChat,
        allowScreenShare: input.allowScreenShare ?? row.allowScreenShare,
        recordOnStart: input.recordOnStart ?? row.recordOnStart,
      },
      include: this.fullInclude(),
    });
    return this.toDto(updated);
  }

  /** Cancel a scheduled session — students see it greyed out instead of joinable. */
  async cancel(sessionId: string, ctx: CourseAuthCtx): Promise<LiveSessionDto> {
    const row = await this.loadOrThrow(sessionId);
    this.ensureCanManage(row.course, ctx);
    if (row.status === LiveSessionStatus.CANCELLED) return this.toDto(row);
    if (row.status === LiveSessionStatus.ENDED) {
      throw ApiError.badRequest('Cannot cancel a session that has already ended');
    }
    const updated = await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveSessionStatus.CANCELLED, roomActive: false },
      include: this.fullInclude(),
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, sessionId, { event: 'cancelled' });
    return this.toDto(updated);
  }

  async remove(sessionId: string, ctx: CourseAuthCtx): Promise<void> {
    const row = await this.loadOrThrow(sessionId);
    this.ensureCanManage(row.course, ctx);
    if (row.status === LiveSessionStatus.LIVE) {
      throw ApiError.badRequest('Cannot delete a session currently LIVE — end it first');
    }
    await this.prisma.$transaction([
      this.prisma.liveSession.delete({ where: { id: sessionId } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'LiveSession',
          entityId: sessionId,
          metadata: { courseId: row.courseId },
        },
      }),
    ]);
  }

  /** Host calls this when they begin the class. Idempotent. */
  async markStarted(sessionId: string, ctx: CourseAuthCtx): Promise<LiveSessionDto> {
    const row = await this.loadOrThrow(sessionId);
    this.ensureIsHost(row, ctx);
    if (row.status === LiveSessionStatus.LIVE) return this.toDto(row);
    if (row.status !== LiveSessionStatus.SCHEDULED) {
      throw ApiError.badRequest(`Cannot start a session in ${row.status} state`);
    }
    const updated = await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        status: LiveSessionStatus.LIVE,
        roomActive: true,
        actualStart: new Date(),
      },
      include: this.fullInclude(),
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, sessionId, { event: 'started' });
    return this.toDto(updated);
  }

  /** Host calls this when they end the class. Idempotent. */
  async markEnded(sessionId: string, ctx: CourseAuthCtx): Promise<LiveSessionDto> {
    const row = await this.loadOrThrow(sessionId);
    this.ensureIsHost(row, ctx);
    if (row.status === LiveSessionStatus.ENDED) return this.toDto(row);
    if (row.status !== LiveSessionStatus.LIVE) {
      throw ApiError.badRequest(`Cannot end a session in ${row.status} state`);
    }
    const updated = await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        status: LiveSessionStatus.ENDED,
        roomActive: false,
        actualEnd: new Date(),
      },
      include: this.fullInclude(),
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, sessionId, { event: 'ended' });
    return this.toDto(updated);
  }

  // ---- join token ------------------------------------------------------

  /**
   * Mint a LiveKit JWT for the caller to join the session's room.
   * Permissions:
   *   - host (the session's hostId or admin): full publish
   *   - everyone else (enrolled student): subscribe-only
   * Rejects if the session is CANCELLED or ENDED.
   */
  async joinToken(sessionId: string, ctx: CourseAuthCtx, displayName: string): Promise<JoinTokenDto> {
    if (!isLiveKitConfigured()) {
      throw ApiError.badRequest(
        'Live video is not configured on this deployment. Set LIVEKIT_URL/_API_KEY/_API_SECRET. See README → "LiveKit setup".',
      );
    }
    const row = await this.loadOrThrow(sessionId);
    if (row.status === LiveSessionStatus.CANCELLED) {
      throw ApiError.badRequest('Session was cancelled');
    }
    if (row.status === LiveSessionStatus.ENDED) {
      throw ApiError.badRequest('Session has ended');
    }
    const isHost = ctx.role === Role.ADMIN || row.hostId === ctx.userId;
    if (!isHost) await this.ensureEnrolled(row.courseId, ctx);

    const token = await buildAccessToken({
      identity: ctx.userId,
      displayName,
      roomName: row.roomName,
      isHost,
    });
    return {
      token,
      url: getPublicSignalUrl(),
      roomName: row.roomName,
      isHost,
    };
  }

  // ---- helpers ---------------------------------------------------------

  private async loadOrThrow(sessionId: string) {
    const row = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { ...this.fullInclude(), course: true },
    });
    if (!row || row.course.deletedAt) throw ApiError.notFound('Live session not found');
    return row;
  }

  private async loadCourse(courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, teacherId: true, deletedAt: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    return course;
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
    await this.ensureEnrolled(course.id, ctx);
  }

  private ensureIsHost(
    row: { hostId: string },
    ctx: CourseAuthCtx,
  ): void {
    if (ctx.role !== Role.ADMIN && row.hostId !== ctx.userId) {
      throw ApiError.forbidden('Only the session host can do that');
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

  private audit(actorId: string, action: AuditAction, entityId: string, metadata: Prisma.JsonValue) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entity: 'LiveSession', entityId, metadata: metadata ?? undefined },
    });
  }

  private fullInclude() {
    return {
      host: { select: { id: true, fullName: true } },
      _count: { select: { recordings: true } },
    } satisfies Prisma.LiveSessionInclude;
  }

  private toDto(
    row: Prisma.LiveSessionGetPayload<{ include: ReturnType<LiveSessionsService['fullInclude']> }>,
  ): LiveSessionDto {
    return {
      id: row.id,
      courseId: row.courseId,
      lessonId: row.lessonId,
      title: row.title,
      description: row.description,
      host: row.host,
      status: row.status,
      roomName: row.roomName,
      roomActive: row.roomActive,
      scheduledStart: row.scheduledStart.toISOString(),
      scheduledEnd: row.scheduledEnd.toISOString(),
      actualStart: row.actualStart?.toISOString() ?? null,
      actualEnd: row.actualEnd?.toISOString() ?? null,
      allowChat: row.allowChat,
      allowScreenShare: row.allowScreenShare,
      recordOnStart: row.recordOnStart,
      recordingsCount: row._count.recordings,
    };
  }
}
