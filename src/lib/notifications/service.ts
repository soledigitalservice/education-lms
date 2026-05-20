/* eslint-disable no-console */
import {
  NotificationChannel,
  NotificationKind,
  Prisma,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import { isEmailConfigured, isPushConfigured } from '../env';
import { getMailer, renderTemplate } from '../mailer';
import { NotificationPreferencesService } from '../notification-preferences/service';
import { sendPushToUser } from '../push';

export interface DispatchInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app deep link (e.g. `/courses/algebra-101/lessons/abc`). */
  link?: string;
  /** Arbitrary payload stored on the row — useful for richer FE rendering later. */
  data?: Prisma.JsonValue;
  /**
   * Dedup key. If a notification with `data.dedupKey === this` already exists
   * for the same user, dispatch becomes a no-op. Use for scheduler-style
   * "remind once" semantics (e.g. one ASSIGNMENT_DUE_SOON per assignment).
   */
  dedupKey?: string;
  /**
   * Channels to attempt. Defaults to ['inapp', 'email', 'push']. Skip 'email'
   * for chat messages (otherwise the user is spammed every line) — they only
   * get the in-app + push when active in a different room.
   */
  channels?: Array<'inapp' | 'email' | 'push'>;
}

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  data: Prisma.JsonValue;
  readAt: string | null;
  createdAt: string;
}

export class NotificationsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Best-effort dispatch. Never throws — the calling business action
   * (approve teacher, grade submission…) must NOT be rolled back if email
   * or push delivery fails.
   */
  async dispatch(input: DispatchInput): Promise<NotificationDto | null> {
    try {
      // Dedup check.
      if (input.dedupKey) {
        const existing = await this.prisma.notification.findFirst({
          where: {
            userId: input.userId,
            kind: input.kind,
            // JSONB path-equals is supported via Prisma's `path` filter.
            data: { path: ['dedupKey'], equals: input.dedupKey },
          },
          select: { id: true },
        });
        if (existing) return null;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, fullName: true, email: true, status: true, deletedAt: true },
      });
      if (!user || user.deletedAt || user.status !== 'ACTIVE') return null;

      const channels = input.channels ?? ['inapp', 'email', 'push'];
      const data: Prisma.JsonObject = {
        ...(typeof input.data === 'object' && input.data !== null && !Array.isArray(input.data)
          ? (input.data as Prisma.JsonObject)
          : {}),
        ...(input.dedupKey ? { dedupKey: input.dedupKey } : {}),
      };

      // Capa 11: load the user's per-channel preferences in ONE query and
      // close over the gate. Cheap (a row count of dozens at most).
      const prefs = new NotificationPreferencesService(this.prisma);
      const allow = await prefs.loadGateForUser(input.userId);

      // INAPP is always-on (preferences enforce it; we keep the channel array
      // check too in case the caller explicitly opted out — chat does not).
      const wantInapp =
        channels.includes('inapp') && allow(input.kind, NotificationChannel.INAPP);

      const row = wantInapp
        ? await this.prisma.notification.create({
            data: {
              userId: input.userId,
              kind: input.kind,
              title: input.title,
              body: input.body,
              link: input.link ?? null,
              data: Object.keys(data).length > 0 ? data : Prisma.JsonNull,
            },
          })
        : null;

      // Email (best-effort, parallel with push)
      const emailPromise = (async () => {
        if (!channels.includes('email')) return;
        if (!isEmailConfigured()) return;
        if (!allow(input.kind, NotificationChannel.EMAIL)) return;
        const tmpl = renderTemplate(input.kind, {
          recipientName: user.fullName,
          title: input.title,
          body: input.body,
          link: input.link,
        });
        const ok = await getMailer().send({
          to: user.email,
          subject: tmpl.subject,
          html: tmpl.html,
          text: tmpl.text,
        });
        if (ok && row) {
          await this.prisma.notification
            .update({ where: { id: row.id }, data: { emailedAt: new Date() } })
            .catch(() => undefined);
        }
      })();

      const pushPromise = (async () => {
        if (!channels.includes('push')) return;
        if (!isPushConfigured()) return;
        if (!allow(input.kind, NotificationChannel.PUSH)) return;
        const result = await sendPushToUser(this.prisma, input.userId, {
          title: input.title,
          body: input.body,
          link: input.link,
          tag: input.dedupKey ?? `${input.kind}:${row?.id ?? input.userId}`,
        });
        if (result.sent > 0 && row) {
          await this.prisma.notification
            .update({ where: { id: row.id }, data: { pushedAt: new Date() } })
            .catch(() => undefined);
        }
      })();

      await Promise.allSettled([emailPromise, pushPromise]);

      return row ? this.toDto(row) : null;
    } catch (err) {
      console.warn('Notification dispatch failed (suppressed):', err);
      return null;
    }
  }

  // ---- read --------------------------------------------------------------

  async listForUser(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number; cursor?: string },
  ): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(opts.limit ?? 50, 1), 100),
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
    return rows.map((r) => this.toDto(r));
  }

  async unreadCountForUser(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  // ---- mark --------------------------------------------------------------

  async markRead(notificationId: string, userId: string, role: Role): Promise<void> {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true, readAt: true },
    });
    if (!n) throw ApiError.notFound('Notification not found');
    if (role !== Role.ADMIN && n.userId !== userId) {
      throw ApiError.forbidden('Not your notification');
    }
    if (n.readAt) return; // idempotent
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  // ---- helpers -----------------------------------------------------------

  private toDto(row: {
    id: string;
    kind: NotificationKind;
    title: string;
    body: string;
    link: string | null;
    data: Prisma.JsonValue;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationDto {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      link: row.link,
      data: row.data,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
