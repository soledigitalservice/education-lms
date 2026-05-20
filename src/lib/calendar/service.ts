import {
  EnrollmentStatus,
  LiveSessionStatus,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import type { CalendarEventKind, CalendarQuery } from './schemas';

export interface CalendarEventDto {
  /// Stable id of the form `<kind>:<sourceId>` so the FE can dedupe and key safely.
  id: string;
  kind: CalendarEventKind;
  title: string;
  /// Optional secondary line (course title, assignment title, etc.).
  subtitle: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  /// Hex color or null — UI falls back to per-kind defaults.
  color: string | null;
  /// Optional deep link to navigate to.
  href: string | null;
  /// When viewing a child's calendar (parent), the owning student name.
  ownerName?: string;
}

/**
 * Aggregates calendar events from across the system into a unified stream:
 *   - LiveSessions where caller is host or enrolled (visible per role rules)
 *   - Assignment due dates the caller cares about (own course as teacher,
 *     or enrolled course as student)
 *   - Course startsAt / endsAt boundaries (where the caller participates)
 *   - Manual ScheduleEvents owned by the caller
 *
 * Range query defaults to [today, today+60d].
 */
export class CalendarService {
  constructor(private readonly prisma: PrismaClient) {}

  async eventsForUser(userId: string, role: Role, query: CalendarQuery): Promise<CalendarEventDto[]> {
    const { from, to } = this.normaliseRange(query);
    const events: CalendarEventDto[] = [];

    // ----- LiveSessions ----------------------------------------------
    const liveSessions = await this.prisma.liveSession.findMany({
      where: {
        scheduledStart: { gte: from, lte: to },
        status: { in: [LiveSessionStatus.SCHEDULED, LiveSessionStatus.LIVE] },
        ...(role === Role.ADMIN
          ? {}
          : role === Role.TEACHER
            ? { OR: [
                { hostId: userId },
                { course: { teacherId: userId } },
              ] }
            : {
                // student/parent see only those they're enrolled in
                course: {
                  enrollments: {
                    some: {
                      studentId: userId,
                      status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
                    },
                  },
                },
              }),
      },
      include: { course: { select: { id: true, slug: true, title: true } } },
    });
    for (const s of liveSessions) {
      events.push({
        id: `LIVE_SESSION:${s.id}`,
        kind: 'LIVE_SESSION',
        title: s.title,
        subtitle: s.course.title,
        startsAt: s.scheduledStart.toISOString(),
        endsAt: s.scheduledEnd.toISOString(),
        allDay: false,
        color: s.status === LiveSessionStatus.LIVE ? '#dc2626' : '#2563eb',
        href: `/courses/${s.course.slug}/live/${s.id}`,
      });
    }

    // ----- Assignment due dates --------------------------------------
    const assignments = await this.prisma.assignment.findMany({
      where: {
        dueAt: { not: null, gte: from, lte: to },
        publishedAt: { not: null },
        ...(role === Role.ADMIN
          ? {}
          : role === Role.TEACHER
            ? { course: { teacherId: userId } }
            : {
                course: {
                  enrollments: {
                    some: {
                      studentId: userId,
                      status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
                    },
                  },
                },
              }),
      },
      include: { course: { select: { slug: true, title: true } } },
    });
    for (const a of assignments) {
      if (!a.dueAt) continue;
      events.push({
        id: `ASSIGNMENT_DUE:${a.id}`,
        kind: 'ASSIGNMENT_DUE',
        title: `📋 ${a.title}`,
        subtitle: a.course.title,
        startsAt: a.dueAt.toISOString(),
        endsAt: null,
        allDay: false,
        color: '#f59e0b',
        href: a.lessonId
          ? `/courses/${a.course.slug}/lessons/${a.lessonId}`
          : `/courses/${a.course.slug}`,
      });
    }

    // ----- Course boundaries -----------------------------------------
    const courses = await this.prisma.course.findMany({
      where: {
        deletedAt: null,
        OR: [
          { startsAt: { gte: from, lte: to } },
          { endsAt: { gte: from, lte: to } },
        ],
        ...(role === Role.ADMIN
          ? {}
          : role === Role.TEACHER
            ? { teacherId: userId }
            : {
                enrollments: {
                  some: {
                    studentId: userId,
                    status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
                  },
                },
              }),
      },
      select: { id: true, slug: true, title: true, startsAt: true, endsAt: true },
    });
    for (const c of courses) {
      if (c.startsAt && c.startsAt >= from && c.startsAt <= to) {
        events.push({
          id: `COURSE_START:${c.id}`,
          kind: 'COURSE_START',
          title: `Inicio: ${c.title}`,
          subtitle: null,
          startsAt: c.startsAt.toISOString(),
          endsAt: null,
          allDay: true,
          color: '#10b981',
          href: `/courses/${c.slug}`,
        });
      }
      if (c.endsAt && c.endsAt >= from && c.endsAt <= to) {
        events.push({
          id: `COURSE_END:${c.id}`,
          kind: 'COURSE_END',
          title: `Fin: ${c.title}`,
          subtitle: null,
          startsAt: c.endsAt.toISOString(),
          endsAt: null,
          allDay: true,
          color: '#64748b',
          href: `/courses/${c.slug}`,
        });
      }
    }

    // ----- Manual ScheduleEvents (own only — admins see everyone's via the dedicated endpoint) ---
    const manualEvents = await this.prisma.scheduleEvent.findMany({
      where: {
        ownerId: userId,
        startsAt: { gte: from, lte: to },
      },
    });
    for (const e of manualEvents) {
      events.push({
        id: `MANUAL:${e.id}`,
        kind: 'MANUAL',
        title: e.title,
        subtitle: e.notes,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        allDay: e.allDay,
        color: e.color ?? '#8b5cf6',
        href: null,
      });
    }

    return events.sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  }

  /** Parent view: aggregate the calendar for one approved child. */
  async eventsForChild(
    childId: string,
    query: CalendarQuery,
    ctx: CourseAuthCtx,
  ): Promise<CalendarEventDto[]> {
    if (ctx.role !== Role.PARENT && ctx.role !== Role.ADMIN) {
      throw ApiError.forbidden('Only parents can read a child calendar');
    }
    if (ctx.role === Role.PARENT) {
      const link = await this.prisma.parentChildLink.findUnique({
        where: { parentId_childId: { parentId: ctx.userId, childId } },
        select: { status: true },
      });
      if (!link || link.status !== 'APPROVED') {
        throw ApiError.forbidden('No approved link to that student');
      }
    }
    // The child is a STUDENT — fetch their calendar from their perspective.
    const child = await this.prisma.user.findUnique({
      where: { id: childId },
      select: { fullName: true, role: true },
    });
    if (!child || child.role !== Role.STUDENT) {
      throw ApiError.notFound('Student not found');
    }
    const events = await this.eventsForUser(childId, Role.STUDENT, query);
    // Tag each with the child's name so the parent UI can distinguish multi-child views later.
    return events
      // Drop the child's MANUAL personal events — parents shouldn't see private notes.
      .filter((e) => e.kind !== 'MANUAL')
      .map((e) => ({ ...e, ownerName: child.fullName }));
  }

  // ---- helpers ---------------------------------------------------------

  private normaliseRange(q: CalendarQuery): { from: Date; to: Date } {
    const now = new Date();
    const from = q.from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = q.to ?? new Date(from.getTime() + 60 * 24 * 60 * 60 * 1000);
    if (to <= from) {
      throw ApiError.badRequest('`to` must be after `from`');
    }
    // Soft cap: 6 months window to avoid runaway queries.
    const MAX_RANGE_MS = 6 * 30 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw ApiError.badRequest('Range too wide; max 6 months');
    }
    return { from, to };
  }
}
