import {
  EnrollmentStatus,
  GradeScale,
  SubmissionStatus,
  type PrismaClient,
} from '@prisma/client';

// ---------------------------------------------------------------------------
//  DTOs — the full analytics snapshot for one course.
//
//  Everything here is DERIVED from data the platform already records
//  (enrollments, submissions, grades, quiz attempts, live attendance, forum
//  posts). There is intentionally NO per-lesson "viewed" tracking table, so
//  "completion" is defined as the fraction of *gradeable items* (published
//  assignments + published quizzes) a student has submitted/attempted.
// ---------------------------------------------------------------------------

export interface CourseAnalytics {
  course: { id: string; title: string; slug: string };
  /** Number of ACTIVE enrollments — the denominator for most rates. */
  activeStudents: number;
  overview: {
    activeStudents: number;
    completedStudents: number;
    pendingRequests: number;
    /** REJECTED + REMOVED. */
    droppedOrRejected: number;
    gradeableItems: number;
    /** Published lessons in the course — the denominator for completion. */
    publishedLessons: number;
    /** 0-100, average over active students of (lessons completed / published lessons). null if no published lessons. */
    avgCompletionPct: number | null;
    /** Active students who have completed every published lesson. */
    fullyComplete: number;
    /** 0-100, mean of all numeric grade percentages in the course. null if nothing graded. */
    avgGradePct: number | null;
    gradedCount: number;
  };
  enrollment: {
    byStatus: Record<EnrollmentStatus, number>;
    /** Weekly requested-enrollment counts, oldest → newest, zero-filled. */
    weekly: Array<{ week: string; count: number }>;
  };
  grades: {
    /** 6 fixed buckets covering 0-100 (% of max score). */
    distribution: Array<{ label: string; from: number; to: number; count: number }>;
    avgPct: number | null;
    medianPct: number | null;
    count: number;
  };
  /** Published assignments + quizzes, in curriculum order. */
  evaluations: EvaluationStat[];
  /** Per-lesson completion, in curriculum order — the drop-off view. */
  lessonProgress: LessonCompletionStat[];
  liveSessions: LiveSessionStat[];
  /** Daily course activity for the last 30 days, zero-filled. */
  activity: ActivityDay[];
}

export interface EvaluationStat {
  id: string;
  kind: 'ASSIGNMENT' | 'QUIZ';
  title: string;
  /** Distinct active students who submitted (assignment) or attempted (quiz). */
  done: number;
  /** done / activeStudents, 0-100. */
  ratePct: number;
  onTime: number;
  late: number;
  /** 0-100 average score (% of max). null if nothing graded yet. */
  avgScorePct: number | null;
}

export interface LessonCompletionStat {
  id: string;
  title: string;
  /** Distinct active students who at least opened the lesson. */
  viewed: number;
  /** Distinct active students who marked it complete. */
  completed: number;
  /** completed / activeStudents, 0-100. */
  completionPct: number;
}

export interface LiveSessionStat {
  id: string;
  title: string;
  scheduledStart: string;
  status: string;
  attendees: number;
  /** attendees / activeStudents, 0-100. */
  attendancePct: number;
}

export interface ActivityDay {
  day: string;
  submissions: number;
  quizAttempts: number;
  forumPosts: number;
}

const GRADE_BUCKETS: Array<{ label: string; from: number; to: number }> = [
  { label: '0–49', from: 0, to: 50 },
  { label: '50–59', from: 50, to: 60 },
  { label: '60–69', from: 60, to: 70 },
  { label: '70–79', from: 70, to: 80 },
  { label: '80–89', from: 80, to: 90 },
  { label: '90–100', from: 90, to: 100.01 },
];

const ALL_ENROLLMENT_STATUSES = Object.values(EnrollmentStatus);

export class CourseAnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  async getCourseAnalytics(courseId: string): Promise<CourseAnalytics> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, title: true, slug: true },
    });
    if (!course) throw new Error('Course not found');

    // Active student ids drive every rate denominator.
    const activeEnr = await this.prisma.enrollment.findMany({
      where: { courseId, status: EnrollmentStatus.ACTIVE },
      select: { studentId: true },
    });
    const activeIds = new Set(activeEnr.map((e) => e.studentId));
    const N = activeIds.size;

    const [
      statusCounts,
      assignments,
      quizzes,
      lessons,
      progressRows,
      liveSessions,
      weekly,
      activity,
    ] = await Promise.all([
        this.prisma.enrollment.groupBy({
          by: ['status'],
          where: { courseId },
          _count: { _all: true },
        }),
        this.prisma.assignment.findMany({
          where: { courseId, publishedAt: { not: null } },
          include: {
            lesson: { include: { module: { select: { position: true } } } },
            submissions: { include: { grade: true } },
          },
        }),
        this.prisma.quiz.findMany({
          where: { publishedAt: { not: null }, lesson: { module: { courseId } } },
          include: {
            lesson: { include: { module: { select: { position: true } } } },
            attempts: { include: { grade: true } },
          },
        }),
        this.prisma.lesson.findMany({
          where: { publishedAt: { not: null }, module: { courseId } },
          select: {
            id: true,
            title: true,
            position: true,
            module: { select: { position: true } },
          },
        }),
        this.prisma.lessonProgress.findMany({
          where: { lesson: { module: { courseId } } },
          select: { lessonId: true, studentId: true, completedAt: true },
        }),
        this.prisma.liveSession.findMany({
          where: { courseId },
          orderBy: { scheduledStart: 'desc' },
          take: 12,
          include: { _count: { select: { participants: true } } },
        }),
        this.weeklyEnrollments(courseId),
        this.dailyActivity(courseId),
      ]);

    // ---- enrollment funnel -------------------------------------------------
    const byStatus = Object.fromEntries(
      ALL_ENROLLMENT_STATUSES.map((s) => [s, 0]),
    ) as Record<EnrollmentStatus, number>;
    for (const row of statusCounts) byStatus[row.status] = row._count._all;

    // ---- per-evaluation + grade collection ---------------------------------
    const allGradePcts: number[] = [];

    const assignmentStats: Array<EvaluationStat & { sortKey: number }> = assignments.map(
      (a) => {
        const seen = new Set<string>();
        let onTime = 0;
        let late = 0;
        const scorePcts: number[] = [];
        for (const sub of a.submissions) {
          if (sub.status === SubmissionStatus.DRAFT) continue;
          if (activeIds.has(sub.studentId) && !seen.has(sub.studentId)) {
            seen.add(sub.studentId);
          }
          const isLate =
            sub.status === SubmissionStatus.LATE ||
            (a.dueAt != null && sub.submittedAt != null && sub.submittedAt > a.dueAt);
          if (isLate) late++;
          else onTime++;

          if (
            sub.grade &&
            sub.grade.scale === GradeScale.NUMERIC &&
            sub.grade.numericValue != null &&
            a.maxScore > 0
          ) {
            const pct = clampPct((sub.grade.numericValue / a.maxScore) * 100);
            scorePcts.push(pct);
            allGradePcts.push(pct);
          }
        }
        return {
          id: a.id,
          kind: 'ASSIGNMENT' as const,
          title: a.title,
          done: seen.size,
          ratePct: N > 0 ? Math.round((seen.size / N) * 100) : 0,
          onTime,
          late,
          avgScorePct: scorePcts.length ? round1(mean(scorePcts)) : null,
          sortKey: orderKey(a.lesson?.module?.position, a.lesson?.position),
        };
      },
    );

    const quizStats: Array<EvaluationStat & { sortKey: number }> = quizzes.map((qz) => {
      const seen = new Set<string>();
      const scorePcts: number[] = [];
      for (const at of qz.attempts) {
        if (at.submittedAt == null) continue;
        if (activeIds.has(at.studentId) && !seen.has(at.studentId)) {
          seen.add(at.studentId);
        }
        if (at.score != null && at.maxScore != null && at.maxScore > 0) {
          const pct = clampPct((at.score / at.maxScore) * 100);
          scorePcts.push(pct);
          allGradePcts.push(pct);
        }
      }
      return {
        id: qz.id,
        kind: 'QUIZ' as const,
        title: qz.title,
        done: seen.size,
        ratePct: N > 0 ? Math.round((seen.size / N) * 100) : 0,
        onTime: seen.size, // quizzes have no late concept; surfaced as "completed"
        late: 0,
        avgScorePct: scorePcts.length ? round1(mean(scorePcts)) : null,
        sortKey: orderKey(qz.lesson.module.position, qz.lesson.position),
      };
    });

    const evaluations: EvaluationStat[] = [...assignmentStats, ...quizStats]
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ sortKey: _sortKey, ...rest }) => rest);

    const gradeableItems = assignments.length + quizzes.length;
    const publishedLessons = lessons.length;

    // ---- lesson progress (views + completion), active students only --------
    // Per lesson: distinct active students who viewed / completed it.
    const viewedByLesson = new Map<string, Set<string>>();
    const completedByLesson = new Map<string, Set<string>>();
    // Per student: how many distinct lessons they've completed.
    const completedCountByStudent = new Map<string, number>();
    for (const p of progressRows) {
      if (!activeIds.has(p.studentId)) continue;
      (viewedByLesson.get(p.lessonId) ?? setInto(viewedByLesson, p.lessonId)).add(p.studentId);
      if (p.completedAt != null) {
        (completedByLesson.get(p.lessonId) ?? setInto(completedByLesson, p.lessonId)).add(
          p.studentId,
        );
        completedCountByStudent.set(
          p.studentId,
          (completedCountByStudent.get(p.studentId) ?? 0) + 1,
        );
      }
    }

    const lessonProgress: LessonCompletionStat[] = lessons
      .map((l) => {
        const completed = completedByLesson.get(l.id)?.size ?? 0;
        return {
          id: l.id,
          title: l.title,
          viewed: viewedByLesson.get(l.id)?.size ?? 0,
          completed,
          completionPct: N > 0 ? Math.round((completed / N) * 100) : 0,
          sortKey: orderKey(l.module.position, l.position),
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ sortKey: _sortKey, ...rest }) => rest);

    // ---- completion (lesson-based) -----------------------------------------
    let avgCompletionPct: number | null = null;
    let fullyComplete = 0;
    if (publishedLessons > 0 && N > 0) {
      let sumPct = 0;
      for (const sid of activeIds) {
        const done = completedCountByStudent.get(sid) ?? 0;
        sumPct += (done / publishedLessons) * 100;
        if (done >= publishedLessons) fullyComplete++;
      }
      avgCompletionPct = round1(sumPct / N);
    }

    // ---- grade distribution ------------------------------------------------
    const distribution = GRADE_BUCKETS.map((b) => ({
      ...b,
      count: allGradePcts.filter((p) => p >= b.from && p < b.to).length,
    }));

    return {
      course,
      activeStudents: N,
      overview: {
        activeStudents: N,
        completedStudents: byStatus[EnrollmentStatus.COMPLETED],
        pendingRequests: byStatus[EnrollmentStatus.PENDING],
        droppedOrRejected:
          byStatus[EnrollmentStatus.REJECTED] + byStatus[EnrollmentStatus.REMOVED],
        gradeableItems,
        publishedLessons,
        avgCompletionPct,
        fullyComplete,
        avgGradePct: allGradePcts.length ? round1(mean(allGradePcts)) : null,
        gradedCount: allGradePcts.length,
      },
      enrollment: { byStatus, weekly },
      grades: {
        distribution,
        avgPct: allGradePcts.length ? round1(mean(allGradePcts)) : null,
        medianPct: allGradePcts.length ? round1(median(allGradePcts)) : null,
        count: allGradePcts.length,
      },
      evaluations,
      lessonProgress,
      liveSessions: liveSessions.map((s) => ({
        id: s.id,
        title: s.title,
        scheduledStart: s.scheduledStart.toISOString(),
        status: s.status,
        attendees: s._count.participants,
        attendancePct: N > 0 ? Math.round((s._count.participants / N) * 100) : 0,
      })),
      activity,
    };
  }

  // ---- weekly enrollment requests (last 12 weeks) ------------------------

  private async weeklyEnrollments(
    courseId: string,
  ): Promise<Array<{ week: string; count: number }>> {
    const weeks = 12;
    const start = startOfWeekUTC(new Date());
    start.setUTCDate(start.getUTCDate() - (weeks - 1) * 7);

    type Row = { wk: Date; n: bigint };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT date_trunc('week', "requestedAt")::date AS wk, COUNT(*)::bigint AS n
      FROM "Enrollment"
      WHERE "courseId" = ${courseId} AND "requestedAt" >= ${start}
      GROUP BY wk ORDER BY wk ASC
    `;
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.wk.toISOString().slice(0, 10), Number(r.n));

    const out: Array<{ week: string; count: number }> = [];
    for (let i = 0; i < weeks; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i * 7);
      const key = d.toISOString().slice(0, 10);
      out.push({ week: key, count: map.get(key) ?? 0 });
    }
    return out;
  }

  // ---- daily activity (last 30 days) -------------------------------------

  private async dailyActivity(courseId: string): Promise<ActivityDay[]> {
    const days = 30;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    type Row = { day: Date; n: bigint };
    const [subs, attempts, posts] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', s."submittedAt")::date AS day, COUNT(*)::bigint AS n
        FROM "Submission" s
        JOIN "Assignment" a ON a.id = s."assignmentId"
        WHERE a."courseId" = ${courseId}
          AND s."submittedAt" >= ${start} AND s."submittedAt" IS NOT NULL
        GROUP BY day ORDER BY day ASC
      `,
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', qa."submittedAt")::date AS day, COUNT(*)::bigint AS n
        FROM "QuizAttempt" qa
        JOIN "Quiz" q ON q.id = qa."quizId"
        JOIN "Lesson" l ON l.id = q."lessonId"
        JOIN "Module" m ON m.id = l."moduleId"
        WHERE m."courseId" = ${courseId}
          AND qa."submittedAt" >= ${start} AND qa."submittedAt" IS NOT NULL
        GROUP BY day ORDER BY day ASC
      `,
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', p."createdAt")::date AS day, COUNT(*)::bigint AS n
        FROM "ForumPost" p
        JOIN "ForumThread" t ON t.id = p."threadId"
        JOIN "Forum" f ON f.id = t."forumId"
        WHERE f."courseId" = ${courseId}
          AND p."createdAt" >= ${start} AND p."deletedAt" IS NULL
        GROUP BY day ORDER BY day ASC
      `,
    ]);

    const subMap = bucketize(subs);
    const atMap = bucketize(attempts);
    const postMap = bucketize(posts);

    const out: ActivityDay[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      out.push({
        day: key,
        submissions: subMap.get(key) ?? 0,
        quizAttempts: atMap.get(key) ?? 0,
        forumPosts: postMap.get(key) ?? 0,
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------

/** Create + register an empty Set for a key, returning it (for inline `?? setInto(...)`). */
function setInto(map: Map<string, Set<string>>, key: string): Set<string> {
  const s = new Set<string>();
  map.set(key, s);
  return s;
}

function bucketize(rows: Array<{ day: Date; n: bigint }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.day.toISOString().slice(0, 10), Number(r.n));
  return m;
}

/** Curriculum sort key: modulePos * 1000 + lessonPos. Orphans (no lesson) sort last. */
function orderKey(modulePos?: number | null, lessonPos?: number | null): number {
  if (modulePos == null || lessonPos == null) return Number.MAX_SAFE_INTEGER;
  return modulePos * 1000 + lessonPos;
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Monday-based start of week, UTC, matching Postgres date_trunc('week'). */
function startOfWeekUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  const day = x.getUTCDay(); // 0=Sun … 6=Sat
  const diff = (day + 6) % 7; // days since Monday
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}
