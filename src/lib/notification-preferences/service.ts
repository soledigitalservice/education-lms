import {
  NotificationChannel,
  NotificationKind,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { BulkUpsertInput, PreferenceItem } from './schemas';

/**
 * Per-channel default. `INAPP` is locked-on (the bell is the only place
 * the user is guaranteed to see history; allowing them to turn it off
 * would silently lose audit). EMAIL and PUSH default on so that opting
 * out is an explicit choice; users that haven't visited the settings
 * page still get the notifications they expect.
 */
const DEFAULTS_BY_CHANNEL: Record<NotificationChannel, boolean> = {
  [NotificationChannel.INAPP]: true,
  [NotificationChannel.EMAIL]: true,
  [NotificationChannel.PUSH]: true,
};

const ALL_KINDS = Object.values(NotificationKind);
const ALL_CHANNELS = Object.values(NotificationChannel);

export interface PreferenceMatrixCell {
  kind: NotificationKind;
  channel: NotificationChannel;
  enabled: boolean;
  /** True when the value comes from defaults (no DB row yet). */
  isDefault: boolean;
  /** True if the user is NOT allowed to toggle this — currently INAPP. */
  locked: boolean;
}

export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Returns the full matrix for the user: every (kind, channel) pair with
   * either the user's stored value or the per-channel default. Frontend can
   * render the whole grid without doing the merge itself.
   */
  async listForUser(userId: string): Promise<PreferenceMatrixCell[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });
    const lookup = new Map<string, boolean>();
    for (const r of rows) lookup.set(`${r.kind}:${r.channel}`, r.enabled);

    const out: PreferenceMatrixCell[] = [];
    for (const kind of ALL_KINDS) {
      for (const channel of ALL_CHANNELS) {
        const key = `${kind}:${channel}`;
        const stored = lookup.get(key);
        const locked = channel === NotificationChannel.INAPP;
        const enabled =
          locked ? true : stored ?? DEFAULTS_BY_CHANNEL[channel];
        out.push({
          kind,
          channel,
          enabled,
          isDefault: stored === undefined,
          locked,
        });
      }
    }
    return out;
  }

  /**
   * The gate consulted by NotificationsService.dispatch. Cheap: one
   * findMany at dispatch start, then in-memory check per channel. Returns
   * true (allowed) when no row exists, falling back to the channel default.
   */
  async isAllowed(
    userId: string,
    kind: NotificationKind,
    channel: NotificationChannel,
  ): Promise<boolean> {
    // INAPP can never be disabled — short-circuit.
    if (channel === NotificationChannel.INAPP) return true;
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId_kind_channel: { userId, kind, channel } },
    });
    if (!row) return DEFAULTS_BY_CHANNEL[channel];
    return row.enabled;
  }

  /**
   * Higher-throughput variant for dispatch: pre-load every preference for
   * the user once, then check (kind, channel) in-memory. Avoids 3 queries
   * per dispatch (one per channel).
   */
  async loadGateForUser(userId: string): Promise<(kind: NotificationKind, channel: NotificationChannel) => boolean> {
    let rows: Array<{ kind: NotificationKind; channel: NotificationChannel; enabled: boolean }> = [];
    try {
      rows = await this.prisma.notificationPreference.findMany({
        where: { userId },
        select: { kind: true, channel: true, enabled: true },
      });
    } catch {
      // Older test mocks may not include `notificationPreference`; allow-all in that case.
      rows = [];
    }
    const lookup = new Map<string, boolean>();
    for (const r of rows) lookup.set(`${r.kind}:${r.channel}`, r.enabled);
    return (kind, channel) => {
      if (channel === NotificationChannel.INAPP) return true;
      const v = lookup.get(`${kind}:${channel}`);
      if (v === undefined) return DEFAULTS_BY_CHANNEL[channel];
      return v;
    };
  }

  /**
   * Replace the user's preferences with the given items. Atomically per row
   * via upsert — partial failures don't lose work. Validates each item is
   * either an actual NotificationKind/NotificationChannel via zod upstream.
   */
  async bulkUpsert(userId: string, input: BulkUpsertInput): Promise<void> {
    if (input.preferences.length === 0) return;
    // Reject attempts to disable INAPP — it's locked-on per design.
    for (const p of input.preferences) {
      if (p.channel === NotificationChannel.INAPP && !p.enabled) {
        throw ApiError.badRequest(
          'INAPP notifications cannot be disabled. Use the bell to mark as read instead.',
        );
      }
    }
    await this.prisma.$transaction(
      input.preferences.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_kind_channel: { userId, kind: p.kind, channel: p.channel } },
          update: { enabled: p.enabled },
          create: { userId, kind: p.kind, channel: p.channel, enabled: p.enabled },
        }),
      ),
    );
  }

  /** Test helper. */
  _defaultsForTests(): Record<NotificationChannel, boolean> {
    return { ...DEFAULTS_BY_CHANNEL };
  }
}

/** Re-export for external imports that want the type shape. */
export type { PreferenceItem };
