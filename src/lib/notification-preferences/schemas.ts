import { z } from 'zod';
import { NotificationChannel, NotificationKind } from '@prisma/client';

/**
 * One row in the matrix the user sees. The full matrix is just an array
 * of these — bulkUpsert replaces every (kind, channel) the user touched.
 */
export const preferenceItemSchema = z.object({
  kind: z.nativeEnum(NotificationKind),
  channel: z.nativeEnum(NotificationChannel),
  enabled: z.boolean(),
});

export const bulkUpsertSchema = z.object({
  preferences: z.array(preferenceItemSchema).min(0).max(200),
});

export type PreferenceItem = z.infer<typeof preferenceItemSchema>;
export type BulkUpsertInput = z.infer<typeof bulkUpsertSchema>;
