import { AuditAction, type PrismaClient } from '@prisma/client';

export interface OverviewStats {
  users: { total: number; byRole: Record<string, number>; pendingTeachers: number };
  courses: { total: number; published: number; draft: number; archived: number };
  enrollments: { active: number; pending: number };
  content: { modules: number; lessons: number; materials: number };
  assessments: { assignments: number; submissions: number; gradedLast7d: number };
  realtime: { chatMessagesLast7d: number; liveSessionsLast30d: number; recordingsReady: number };
}

export interface ActivityFeedEntry {
  id: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  actor: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface EngagementDay {
  /** ISO date "YYYY-MM-DD". */
  day: string;
  newUsers: number;
  newEnrollments: number;
  newSubmissions: number;
  newMessages: number;
}

export class AdminStatsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- overview (one-shot, lots of small counts in parallel) -----------

  async overview(): Promise<OverviewStats> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      usersTotal,
      usersByRoleRaw,
      pendingTeachers,
      coursesTotal,
      coursesPublished,
      coursesDraft,
      coursesArchived,
      activeEnr,
      pendingEnr,
      modules,
      lessons,
      materials,
      assignments,
      submissions,
      gradedLast7d,
      chatMsgsLast7d,
      liveSessionsLast30d,
      recordingsReady,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.user.count({
        where: { deletedAt: null, role: 'TEACHER', status: 'PENDING_APPROVAL' },
      }),
      this.prisma.course.count({ where: { deletedAt: null } }),
      this.prisma.course.count({
        where: { deletedAt: null, publishedAt: { not: null }, archivedAt: null },
      }),
      this.prisma.course.count({
        where: { deletedAt: null, publishedAt: null, archivedAt: null },
      }),
      this.prisma.course.count({ where: { deletedAt: null, archivedAt: { not: null } } }),
      this.prisma.enrollment.count({ where: { status: 'ACTIVE' } }),
      this.prisma.enrollment.count({ where: { status: 'PENDING' } }),
      this.prisma.module.count(),
      this.prisma.lesson.count(),
      this.prisma.material.count(),
      this.prisma.assignment.count(),
      this.prisma.submission.count({ where: { status: { not: 'DRAFT' } } }),
      this.prisma.grade.count({ where: { gradedAt: { gte: sevenDaysAgo } } }),
      this.prisma.message.count({
        where: { createdAt: { gte: sevenDaysAgo }, deletedAt: null },
      }),
      this.prisma.liveSession.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.recording.count({ where: { status: 'READY' } }),
    ]);

    const byRole: Record<string, number> = {};
    for (const row of usersByRoleRaw) byRole[row.role] = row._count._all;

    return {
      users: { total: usersTotal, byRole, pendingTeachers },
      courses: {
        total: coursesTotal,
        published: coursesPublished,
        draft: coursesDraft,
        archived: coursesArchived,
      },
      enrollments: { active: activeEnr, pending: pendingEnr },
      content: { modules, lessons, materials },
      assessments: { assignments, submissions, gradedLast7d },
      realtime: {
        chatMessagesLast7d: chatMsgsLast7d,
        liveSessionsLast30d,
        recordingsReady,
      },
    };
  }

  // ---- recent activity (audit log) -------------------------------------

  async activityFeed(limit = 50): Promise<ActivityFeedEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { actor: { select: { id: true, fullName: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      actor: r.actor,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ---- daily engagement (last N days) ----------------------------------

  /**
   * Returns one row per day for the last `days` days. Uses Prisma `$queryRaw`
   * with `date_trunc('day', ...)` so the aggregation happens server-side.
   *
   * Defensive: we generate the date range JS-side and left-join the counts,
   * so days with zero activity still appear (otherwise the chart would skip
   * them and look misleading).
   */
  async engagement(days = 30): Promise<EngagementDay[]> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    type Row = { day: Date; n: bigint };
    const [users, enrollments, submissions, messages] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::bigint AS n
        FROM "User"
        WHERE "createdAt" >= ${start} AND "deletedAt" IS NULL
        GROUP BY day ORDER BY day ASC
      `,
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::bigint AS n
        FROM "Enrollment"
        WHERE "createdAt" >= ${start}
        GROUP BY day ORDER BY day ASC
      `,
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', "submittedAt")::date AS day, COUNT(*)::bigint AS n
        FROM "Submission"
        WHERE "submittedAt" >= ${start} AND "submittedAt" IS NOT NULL
        GROUP BY day ORDER BY day ASC
      `,
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::bigint AS n
        FROM "Message"
        WHERE "createdAt" >= ${start} AND "deletedAt" IS NULL
        GROUP BY day ORDER BY day ASC
      `,
    ]);

    const usersMap = bucketize(users);
    const enrMap = bucketize(enrollments);
    const subMap = bucketize(submissions);
    const msgMap = bucketize(messages);

    const out: EngagementDay[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      out.push({
        day: key,
        newUsers: usersMap.get(key) ?? 0,
        newEnrollments: enrMap.get(key) ?? 0,
        newSubmissions: subMap.get(key) ?? 0,
        newMessages: msgMap.get(key) ?? 0,
      });
    }
    return out;
  }
}

function bucketize(rows: Array<{ day: Date; n: bigint }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.day.toISOString().slice(0, 10), Number(r.n));
  }
  return m;
}
