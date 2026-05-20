import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { ApiError } from '../api/errors';

export const registerSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2_048),
  keys: z.object({
    p256dh: z.string().min(8).max(200),
    auth: z.string().min(4).max(64),
  }),
});

export type RegisterSubscriptionInput = z.infer<typeof registerSubscriptionSchema>;

/**
 * Registers/unregisters PushSubscription rows. Endpoint is the unique key:
 *   - If the same browser registers again (same endpoint), we update the
 *     keys + reassign to the current user (covers "user A logged out,
 *     user B logged in same browser" — last login wins).
 */
export class PushSubscriptionsService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: RegisterSubscriptionInput, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: input.endpoint },
    });
    if (existing) {
      const updated = await this.prisma.pushSubscription.update({
        where: { endpoint: input.endpoint },
        data: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
      });
      return { id: updated.id };
    }
    const created = await this.prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
    });
    return { id: created.id };
  }

  async unregister(endpoint: string, userId: string): Promise<void> {
    const sub = await this.prisma.pushSubscription.findUnique({ where: { endpoint } });
    if (!sub) return; // idempotent
    if (sub.userId !== userId) throw ApiError.forbidden('Not your subscription');
    await this.prisma.pushSubscription.delete({ where: { endpoint } });
  }
}
