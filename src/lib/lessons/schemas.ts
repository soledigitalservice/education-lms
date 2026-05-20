import { z } from 'zod';
import { LessonType } from '@prisma/client';

export const createLessonSchema = z.object({
  title: z.string().min(2).max(160),
  content: z.string().max(50_000).optional(),
  type: z.nativeEnum(LessonType).default(LessonType.CONTENT),
  durationMin: z.number().int().positive().max(24 * 60).optional(),
});

export const updateLessonSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  content: z.string().max(50_000).optional().nullable(),
  type: z.nativeEnum(LessonType).optional(),
  durationMin: z.number().int().positive().max(24 * 60).optional().nullable(),
  publishedAt: z.coerce.date().nullable().optional(),
});

export const reorderLessonSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type ReorderLessonInput = z.infer<typeof reorderLessonSchema>;
