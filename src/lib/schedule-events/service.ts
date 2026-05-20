import { AuditAction, Role, type PrismaClient } from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import type {
  CreateScheduleEventInput,
  UpdateScheduleEventInput,
} from './schemas';

export interface ScheduleEventDto {
  id: string;
  ownerId: string;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  color: string | null;
  courseId: string | null;
  liveSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ScheduleEventsService {
  constructor(private readonly prisma: PrismaClient) {}

  async listMine(ctx: CourseAuthCtx): Promise<ScheduleEventDto[]> {
    const rows = await this.prisma.scheduleEvent.findMany({
      where: { ownerId: ctx.userId },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(input: CreateScheduleEventInput, ctx: CourseAuthCtx): Promise<ScheduleEventDto> {
    if (input.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: input.courseId },
        select: { id: true, deletedAt: true },
      });
      if (!course || course.deletedAt) throw ApiError.badRequest('Course not found');
    }
    if (input.liveSessionId) {
      const session = await this.prisma.liveSession.findUnique({
        where: { id: input.liveSessionId },
        select: { id: true, courseId: true },
      });
      if (!session) throw ApiError.badRequest('Live session not found');
      // Cross-check consistency: if both are provided, they must match.
      if (input.courseId && session.courseId !== input.courseId) {
        throw ApiError.badRequest('liveSessionId belongs to a different course');
      }
    }

    const created = await this.prisma.scheduleEvent.create({
      data: {
        ownerId: ctx.userId,
        title: input.title.trim(),
        notes: input.notes?.trim() ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allDay: input.allDay,
        color: input.color ?? null,
        courseId: input.courseId ?? null,
        liveSessionId: input.liveSessionId ?? null,
      },
    });
    return this.toDto(created);
  }

  async update(
    eventId: string,
    input: UpdateScheduleEventInput,
    ctx: CourseAuthCtx,
  ): Promise<ScheduleEventDto> {
    const ev = await this.loadOrThrow(eventId);
    this.ensureCanManage(ev, ctx);
    const updated = await this.prisma.scheduleEvent.update({
      where: { id: eventId },
      data: {
        title: input.title?.trim() ?? ev.title,
        notes: input.notes !== undefined ? input.notes?.trim() ?? null : ev.notes,
        startsAt: input.startsAt ?? ev.startsAt,
        endsAt: input.endsAt ?? ev.endsAt,
        allDay: input.allDay ?? ev.allDay,
        color: input.color !== undefined ? input.color ?? null : ev.color,
      },
    });
    return this.toDto(updated);
  }

  async remove(eventId: string, ctx: CourseAuthCtx): Promise<void> {
    const ev = await this.loadOrThrow(eventId);
    this.ensureCanManage(ev, ctx);
    await this.prisma.$transaction([
      this.prisma.scheduleEvent.delete({ where: { id: eventId } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'ScheduleEvent',
          entityId: eventId,
        },
      }),
    ]);
  }

  // ---- helpers ---------------------------------------------------------

  private async loadOrThrow(eventId: string) {
    const ev = await this.prisma.scheduleEvent.findUnique({ where: { id: eventId } });
    if (!ev) throw ApiError.notFound('Event not found');
    return ev;
  }

  private ensureCanManage(ev: { ownerId: string }, ctx: CourseAuthCtx): void {
    if (ctx.role !== Role.ADMIN && ev.ownerId !== ctx.userId) {
      throw ApiError.forbidden('Not your event');
    }
  }

  private toDto(row: {
    id: string;
    ownerId: string;
    title: string;
    notes: string | null;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    color: string | null;
    courseId: string | null;
    liveSessionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ScheduleEventDto {
    return {
      id: row.id,
      ownerId: row.ownerId,
      title: row.title,
      notes: row.notes,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      allDay: row.allDay,
      color: row.color,
      courseId: row.courseId,
      liveSessionId: row.liveSessionId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
