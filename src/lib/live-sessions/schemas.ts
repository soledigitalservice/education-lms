import { z } from 'zod';

export const createLiveSessionSchema = z.object({
  /** Optional 1-1 binding to a lesson (which must be of type LIVE_CLASS). */
  lessonId: z.string().cuid().optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(2_000).optional(),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
  allowChat: z.boolean().default(true),
  allowScreenShare: z.boolean().default(true),
  /** When true, recording starts as soon as the host clicks "Start session". */
  recordOnStart: z.boolean().default(false),
});

export const updateLiveSessionSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2_000).nullable().optional(),
  scheduledStart: z.coerce.date().optional(),
  scheduledEnd: z.coerce.date().optional(),
  allowChat: z.boolean().optional(),
  allowScreenShare: z.boolean().optional(),
  recordOnStart: z.boolean().optional(),
});

export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>;
export type UpdateLiveSessionInput = z.infer<typeof updateLiveSessionSchema>;
