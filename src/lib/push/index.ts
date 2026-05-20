/* eslint-disable no-console */
import webpush from 'web-push';
import type { PrismaClient, PushSubscription as PushSubRow } from '@prisma/client';

import { env, isPushConfigured } from '../env';

let configured = false;

function configureVapid(): void {
  if (configured) return;
  if (!isPushConfigured()) {
    throw new Error(
      'Web Push is not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY in your .env. Generate keys with `npx web-push generate-vapid-keys`.',
    );
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Optional URL the SW navigates to when the user clicks the notification. */
  link?: string;
  /** Tag → if the OS supports it, a same-tag notification REPLACES the previous one. */
  tag?: string;
}

/**
 * Send a single push notification. Returns:
 *   - `true`  if delivered
 *   - `false` if subscription was stale/gone (caller should drop it from DB)
 *   - throws on unexpected errors
 */
export async function sendPushToSubscription(
  sub: Pick<PushSubRow, 'endpoint' | 'p256dh' | 'auth'>,
  payload: PushPayload,
): Promise<boolean> {
  configureVapid();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }, // 24h
    );
    return true;
  } catch (err: unknown) {
    // 404/410 → endpoint is dead, browser unsubscribed.
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return false;
    console.warn(`web-push delivery failed (${status ?? 'no status'}):`, err);
    throw err;
  }
}

/**
 * Fan-out helper: sends the same payload to all of the user's subscriptions
 * and removes any that return gone-410. Best-effort: never throws.
 */
export async function sendPushToUser(
  prisma: PrismaClient,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!isPushConfigured()) return { sent: 0, pruned: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  const toPrune: string[] = [];
  for (const sub of subs) {
    try {
      const ok = await sendPushToSubscription(sub, payload);
      if (ok) sent++;
      else toPrune.push(sub.id);
    } catch {
      // Transient error — leave it for next time.
    }
  }
  if (toPrune.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: toPrune } } });
  }
  return { sent, pruned: toPrune.length };
}
