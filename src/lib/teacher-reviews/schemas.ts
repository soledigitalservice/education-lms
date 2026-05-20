import { z } from 'zod';

export const upsertReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2_000).optional(),
  /// Optional: bind the review to a specific course (the one the author was enrolled in).
  /// When null, it's a "general" review of the teacher; unique per (teacher, author).
  courseId: z.string().cuid().nullable().optional(),
});

export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;
