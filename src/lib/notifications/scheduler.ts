/* eslint-disable no-console */
import { LiveSessionStatus, NotificationKind, type PrismaClient } from '@prisma/client';

import { NotificationsService } from './service';

/**
 * Background recurrence:
 *   - ASSIGNMENT_DUE_SOON  → 24h before dueAt (once per assignment-student pair)
 *   - LIVE_SESSION_STARTING → 15min before scheduledStart (once per session-participant pair)
 *
 * Dedup is enforced via `dispatch({ dedupKey })` which checks the existing
 * Notification rows for the same user+kind+dedupKey.
 *
 * Single-instance assumption: when the app runs as multiple replicas, two
 * processes can race. Easy fix is a Postgres advisory lock on each tick; see
 * "Known limitations" in the Capa 9 memory doc.
 */
const TICK_MS = 60_000;
let cachedInterval: NodeJS.Timeout | null = null;

export function startNotificationScheduler(prisma: PrismaClient): void {
  if (cachedInterval) return;
  console.log('▶ Notification scheduler started (60s tick)');

  const notifications = new NotificationsService(prisma);

  async function tick(): Promise<void> {
    try {
      await Promise.all([
        scanAssignmentsDueSoon(prisma, notifications),
        scanLiveSessionsStarting(prisma, notifications),
      ]);
    } catch (err) {
      console.warn('Notification scheduler tick failed:', err);
    }
  }

  // Fire one immediately so a freshly-booted server doesn't wait 60s.
  void tick();
  cachedInterval = setInterval(() => void tick(), TICK_MS);
}

export function stopNotificationScheduler(): void {
  if (cachedInterval) {
    clearInterval(cachedInterval);
    cachedInterval = null;
  }
}

// ---- scans --------------------------------------------------------------

async function scanAssignmentsDueSoon(
  prisma: PrismaClient,
  notifications: NotificationsService,
): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const assignments = await prisma.assignment.findMany({
    where: {
      publishedAt: { not: null },
      dueAt: { gte: now, lte: horizon },
    },
    include: {
      course: {
        select: {
          slug: true,
          title: true,
          enrollments: {
            where: { status: 'ACTIVE' },
            select: { studentId: true },
          },
        },
      },
    },
  });

  for (const a of assignments) {
    if (!a.dueAt) continue;
    const hoursLeft = Math.round((a.dueAt.getTime() - now.getTime()) / (60 * 60 * 1000));
    for (const enr of a.course.enrollments) {
      // Dedup: one DUE_SOON reminder per (assignment, student).
      await notifications.dispatch({
        userId: enr.studentId,
        kind: NotificationKind.ASSIGNMENT_DUE_SOON,
        title: a.title,
        body: `La tarea "${a.title}" del curso "${a.course.title}" vence en ${hoursLeft}h.`,
        link: a.lessonId
          ? `/courses/${a.course.slug}/lessons/${a.lessonId}`
          : `/courses/${a.course.slug}`,
        dedupKey: `assignment_due_soon:${a.id}`,
      });
    }
  }
}

async function scanLiveSessionsStarting(
  prisma: PrismaClient,
  notifications: NotificationsService,
): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 15 * 60 * 1000);

  const sessions = await prisma.liveSession.findMany({
    where: {
      status: LiveSessionStatus.SCHEDULED,
      scheduledStart: { gte: now, lte: horizon },
    },
    include: {
      course: {
        select: {
          slug: true,
          title: true,
          enrollments: {
            where: { status: 'ACTIVE' },
            select: { studentId: true },
          },
        },
      },
    },
  });

  for (const s of sessions) {
    const minutesLeft = Math.max(
      1,
      Math.round((s.scheduledStart.getTime() - now.getTime()) / 60_000),
    );
    // Notify the host AND every enrolled student.
    const recipients = new Set<string>([
      s.hostId,
      ...s.course.enrollments.map((e) => e.studentId),
    ]);
    for (const userId of recipients) {
      await notifications.dispatch({
        userId,
        kind: NotificationKind.LIVE_SESSION_STARTING,
        title: s.title,
        body: `La clase "${s.title}" de "${s.course.title}" empieza en ${minutesLeft} min.`,
        link: `/courses/${s.course.slug}/live/${s.id}`,
        dedupKey: `live_session_starting:${s.id}`,
      });
    }
  }
}
